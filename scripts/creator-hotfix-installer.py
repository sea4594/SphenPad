#!/usr/bin/env python3
"""Safe, reusable creator-only SphenPad hotfix installer.

Future hotfix bundles carry a manifest + unified patch, not another bespoke
Git/release implementation. Usage:
  python3 scripts/creator-hotfix-installer.py --hotfix ~/Downloads/HOTFIX

The bootstrap ZIP can run its copy of this file before it has been committed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from typing import Optional

REPORTS = (
    'reports/PHASE11_DEPENDENCY_RELEASE_GATE.txt',
    'reports/sphenpad-phase11-release-hashes.json',
)

class InstallerError(RuntimeError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise InstallerError(message)


def git(repo: Path, *args: str, output: bool = False, check: bool = True) -> str:
    command = ['git', *args]
    if not output:
        print('+', ' '.join(command), flush=True)
    completed = subprocess.run(command, cwd=repo, check=False, capture_output=output, text=True)
    if check and completed.returncode:
        detail = (completed.stderr or completed.stdout or '').strip() if output else ''
        raise InstallerError(f'Command failed: {" ".join(command)}' + (f'\n{detail}' if detail else ''))
    return (completed.stdout or '').strip() if output else ''


def call(repo: Path, *args: str) -> None:
    print('+', ' '.join(args), flush=True)
    subprocess.run(args, cwd=repo, check=True)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def valid_relpath(value: str) -> bool:
    path = Path(value)
    return bool(value and not path.is_absolute() and str(path) == value and '..' not in path.parts
                and not value.startswith('-') and not '\\' in value and '\n' not in value)


def read_manifest(hotfix: Path):
    manifest = json.loads((hotfix / 'manifest.json').read_text(encoding='utf-8'))
    require(manifest.get('schema') == 1, 'Unsupported hotfix manifest schema.')
    patch_name = manifest.get('patch')
    require(isinstance(patch_name, str) and valid_relpath(patch_name), 'Unsafe hotfix patch path.')
    patch = hotfix / patch_name
    require(patch.is_file(), f'Missing patch: {patch}')
    require(sha256(patch) == manifest.get('sha256'), 'Hotfix patch hash mismatch; no changes applied.')
    names = manifest.get('files')
    require(isinstance(names, list) and names and len(names) == len(set(names)) and
            all(isinstance(s, str) and valid_relpath(s) for s in names),
            'Invalid hotfix file list.')
    message = manifest.get('message')
    require(isinstance(message, str) and 1 <= len(message) <= 160 and '\n' not in message,
            'Invalid hotfix commit message.')
    # Patch payloads may not modify the normal game or the archive.
    for name in names:
        require(name.startswith(('src/sudokupad/creator/', 'src/ui/Creator', 'scripts/test-creator-',
                                 'scripts/creator-hotfix-installer.py')) or name in (
                   'src/ui/PuzzleEditorPage.tsx', 'src/ui/PuzzleCreatorPage.tsx',
                   'scripts/test-phase11-playtest-regressions.mjs',
                   'scripts/test-phase11-reported-puzzles.ts',
                   'scripts/test-creator-editing-ux-integration.mjs',
                   'scripts/test-creator-phase11-release-ui.mjs',
                   ), f'Patch unexpectedly targets non-creator file: {name}')
    return manifest, patch, names, message


def local_tracked_edits(repo: Path, paths: list[str]) -> list[str]:
    if not paths:
        return []
    # Git porcelain catches staged/unstaged and untracked files, without parsing
    # ambiguous human-readable `git status` output.
    data = subprocess.check_output(['git', 'status', '--porcelain', '-z', '--', *paths], cwd=repo)
    return [p.decode('utf-8', errors='replace') for p in data.split(b'\x00') if p]


def is_ancestor(repo: Path, older: str, newer: str) -> bool:
    return subprocess.run(['git', 'merge-base', '--is-ancestor', older, newer], cwd=repo,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def changed_in_range(repo: Path, older: str, newer: str) -> set[str]:
    data = subprocess.check_output(['git', 'diff', '--name-only', '-z', older, newer], cwd=repo)
    return {p.decode('utf-8') for p in data.split(b'\x00') if p}


def snapshot_reports(repo: Path) -> tuple[dict[str, Optional[bytes]], set[str]]:
    dirty = {name for name in REPORTS if local_tracked_edits(repo, [name])}
    saved = {name: (repo / name).read_bytes() if (repo / name).is_file() else None for name in dirty}
    return saved, dirty


def restore_saved_reports(repo: Path, saved: dict[str, Optional[bytes]]) -> None:
    for name, contents in saved.items():
        path = repo / name
        if contents is None:
            path.unlink(missing_ok=True)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(contents)


def fast_forward(repo: Path, remote: str, patch_paths: list[str], *, after_gate: bool) -> bool:
    head = git(repo, 'rev-parse', 'HEAD', output=True)
    if head == remote:
        return False
    require(is_ancestor(repo, head, remote),
            'Local and remote main have diverged or local main is ahead; refusing to rebase or force-push.')
    # Preserve local tracked changes. Only a true overlap is an error.
    incoming = changed_in_range(repo, head, remote)
    require(not incoming.intersection(patch_paths) or not after_gate,
            'Remote changed a hotfix file while the gate was running; stop for safe reconciliation.')
    nonreports = incoming.difference(REPORTS)
    collision = [name for name in sorted(nonreports) if local_tracked_edits(repo, [name])]
    require(not collision, 'Remote update overlaps local changes: ' + ', '.join(collision))
    saved, dirty_reports = snapshot_reports(repo)
    report_overlap = incoming.intersection(dirty_reports)
    staged_reports = set(git(repo, 'diff', '--cached', '--name-only', output=True).splitlines())
    require(not report_overlap.intersection(staged_reports),
            'Remote update overlaps staged report edits; preserving them without merging.')
    # These two reports are generated by the release gate. Temporarily restore
    # only overlapping reports; reapply their original bytes even on failure.
    try:
        if report_overlap:
            git(repo, 'restore', '--worktree', '--', *sorted(report_overlap))
        git(repo, 'merge', '--ff-only', remote)
    finally:
        restore_saved_reports(repo, {name: saved[name] for name in report_overlap})
    return True


def patch_files_from_git(repo: Path, patch: Path) -> list[str]:
    raw = subprocess.check_output(['git', 'apply', '--numstat', '-z', str(patch)], cwd=repo)
    # git apply --numstat -z: added TAB deleted TAB path NUL per file.
    names = []
    for record in raw.split(b'\x00'):
        if not record:
            continue
        parts = record.split(b'\t', 2)
        require(len(parts) == 3, 'Unsupported patch file header.')
        names.append(parts[2].decode('utf-8'))
    return names


def run_install(repo: Path, hotfix: Path) -> None:
    require((repo / '.git').exists(), f'Not a Git working tree: {repo}')
    manifest, patch, changed, message = read_manifest(hotfix)
    require(git(repo, 'branch', '--show-current', output=True) == 'main', 'Must be on main.')
    listed = patch_files_from_git(repo, patch)
    require(sorted(listed) == sorted(changed), 'Hotfix manifest does not match actual patch file list.')
    git(repo, 'fetch', 'origin', 'main')
    remote = git(repo, 'rev-parse', 'origin/main', output=True)
    fast_forward(repo, remote, changed, after_gate=False)
    # An existing new file or local edit to a patch path is a genuine collision.
    # We do not assume an exact hash for unchanged tests from earlier phases.
    if local_tracked_edits(repo, changed):
        require(subprocess.run(['git', 'apply', '--reverse', '--check', str(patch)], cwd=repo,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0,
                'One or more hotfix files already have local edits. Nothing overwritten.')
        print('The exact hotfix patch is already in the worktree; re-running release verification.', flush=True)
    else:
        is_applied = subprocess.run(['git', 'apply', '--reverse', '--check', str(patch)], cwd=repo,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
        if is_applied:
            print('Hotfix already committed. No new commit needed.', flush=True)
            return
        git(repo, 'apply', '--check', str(patch))
        git(repo, 'apply', str(patch))
    # Generated report modifications predate the gate: keep them byte-for-byte.
    saved, dirty_reports = snapshot_reports(repo)
    try:
        for attempt in range(3):
            try:
                call(repo, 'npm', 'run', 'finish-phase11-release')
            finally:
                # Restore reports if the gate fails, or if user had modified them.
                restore_saved_reports(repo, saved)
            git(repo, 'fetch', 'origin', 'main')
            latest = git(repo, 'rev-parse', 'origin/main', output=True)
            if latest == remote:
                break
            print('Remote main advanced during verification; safely updating and re-running full gate.', flush=True)
            fast_forward(repo, latest, changed, after_gate=True)
            remote = latest
        else:
            raise InstallerError('Remote main advanced repeatedly; stopping without commit/push.')
    except (OSError, subprocess.CalledProcessError, InstallerError):
        print('Release incomplete; hotfix edits remain available. No commit/push.', flush=True)
        raise
    # Commit ONLY the hotfix paths, leaving unrelated staged edits intact.
    # Newly created files need intent-to-add for `git commit --only`.
    stage = changed + [name for name in REPORTS if name not in dirty_reports and (repo / name).is_file()]
    for name in stage:
        if subprocess.run(['git', 'ls-files', '--error-unmatch', '--', name], cwd=repo,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            git(repo, 'add', '-N', '--', name)
    git(repo, 'diff', '--check', 'HEAD', '--', *stage)
    require(git(repo, 'diff', '--name-only', 'HEAD', '--', *stage, output=True),
            'No hotfix changes to commit.')
    git(repo, 'commit', '--only', '-m', message, '--', *stage)
    git(repo, 'push', 'origin', 'main')
    print('SUCCESS: Complete Phase 11 release gate passed; changes pushed to origin/main.', flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description='Safe, reusable SphenPad creator hotfix installer')
    parser.add_argument('--hotfix', type=Path, required=True)
    parser.add_argument('--repo', type=Path, default=Path.home() / 'Desktop/SphenPad')
    args = parser.parse_args()
    try:
        run_install(args.repo.expanduser().resolve(), args.hotfix.expanduser().resolve())
    except (OSError, subprocess.CalledProcessError, InstallerError, ValueError, KeyError) as exc:
        sys.exit(f'ERROR: {exc}')


if __name__ == '__main__':
    main()
