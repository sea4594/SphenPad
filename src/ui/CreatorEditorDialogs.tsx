import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CREATOR_CATALOG_CATEGORIES, creatorCatalogCategory, filterCreatorCatalog, type CreatorCatalogFilter, type CreatorCatalogSearchItem } from "./CreatorCatalogUx";
import "./CreatorEditorUx.css";

type CreatorCatalogItem = CreatorCatalogSearchItem & { icon: string };

/** Reusable, creator-scoped modal keyboard behavior. Focus returns to the opener on close. */
function CreatorModal(props: { title: string; onClose: () => void; children: ReactNode; className?: string; initialFocus?: "first" | "search" }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first = props.initialFocus === "search" ? panel?.querySelector<HTMLInputElement>("[data-creator-catalog-search]") : null;
    (first ?? panel?.querySelector<HTMLElement>("button, input, select, [tabindex='0']"))?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, [props.initialFocus]);
  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); props.onClose(); return; }
    if (event.key === "Tab") {
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex='0']") ?? [])
        .filter((node) => node.getClientRects().length > 0);
      if (nodes.length) {
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    // Do not leak keyboard shortcuts or arrow keys to the puzzle underneath.
    event.stopPropagation();
  }
  return <div className="overlayBackdrop creatorCatalogBackdrop creatorUxBackdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
    <div ref={panelRef} className={`card creatorCatalog creatorUxDialog ${props.className ?? ""}`} role="dialog" aria-modal="true" aria-labelledby={headingId} onKeyDown={handleKey}>
      <div className="creatorOverlayHeader"><h2 className="creatorInspectorHeading" id={headingId}>{props.title}</h2><div className="creatorOverlayActions"><button className="btn" onClick={props.onClose} type="button" aria-label={`Close ${props.title}`}>Close</button></div></div>
      {props.children}
    </div>
  </div>;
}

export function CreatorCatalogDialog(props: { items: readonly CreatorCatalogItem[]; activeId: string | null; onSelect: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CreatorCatalogFilter>("All");
  const filtered = useMemo(() => filterCreatorCatalog(props.items, query, category), [props.items, query, category]);
  const groups = useMemo(() => CREATOR_CATALOG_CATEGORIES.map((name) => ({ name, entries: filtered.filter((item) => creatorCatalogCategory(item.id) === name) })).filter((group) => group.entries.length), [filtered]);
  return <CreatorModal title="Add puzzle element" onClose={props.onClose} initialFocus="search">
    <div className="creatorUxCatalogControls">
      <label className="creatorUxSearchLabel" htmlFor="creator-tool-search">Search tools</label>
      <input id="creator-tool-search" data-creator-catalog-search className="url creatorUxSearch" type="search" autoComplete="off" placeholder="Search by name, rule, or feature…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); event.currentTarget.closest(".creatorUxDialog")?.querySelector<HTMLButtonElement>(".creatorCatalogOption")?.focus(); } if (event.key === "Enter" && filtered[0]) { event.preventDefault(); props.onSelect(filtered[0].id); } }} />
      <div className="creatorUxCategories" role="group" aria-label="Tool categories">
        {(["All", ...CREATOR_CATALOG_CATEGORIES] as CreatorCatalogFilter[]).map((value) => <button className={`btn creatorUxCategory${category === value ? " active" : ""}`} aria-pressed={category === value} type="button" key={value} onClick={() => setCategory(value)}>{value}</button>)}
      </div>
      <div className="creatorUxResultCount" role="status" aria-live="polite">{filtered.length} matching {filtered.length === 1 ? "tool" : "tools"}</div>
    </div>
    <div className="creatorCatalogList creatorUxCatalogResults">
      {groups.map((group) => <section className="creatorUxGroup" key={group.name} aria-label={group.name}>
        <h3 className="creatorUxGroupHeading">{group.name}</h3>
        <div className="creatorUxGroupOptions">{group.entries.map((item) => <button className="creatorCatalogOption" key={item.id} onClick={() => props.onSelect(item.id)} aria-label={`${item.name}: ${item.description}`} type="button"><span aria-hidden="true">{item.icon}</span><div><strong>{item.name}</strong><small>{item.description}</small></div>{props.activeId === item.id ? <em className="creatorUxSelected">Current</em> : null}</button>)}</div>
      </section>)}
      {!filtered.length ? <p className="creatorUxEmpty" role="status">No matching tools. Try a different term or select All.</p> : null}
    </div>
  </CreatorModal>;
}

const shortcuts: ReadonlyArray<{ section: string; keys: string; action: string }> = [
  { section: "Navigation", keys: "Ctrl/Cmd + K", action: "Find and add an element" },
  { section: "Navigation", keys: "?", action: "Show keyboard shortcuts" },
  { section: "Navigation", keys: "+ / −", action: "Zoom in / out" },
  { section: "Navigation", keys: "Esc", action: "Cancel adding or clear selected objects" },
  { section: "History", keys: "N / Ctrl/Cmd + Z", action: "Undo creator edit" },
  { section: "History", keys: "M / Ctrl/Cmd + Shift + Z", action: "Redo creator edit" },
  { section: "Grid entry", keys: "Z / X / C / V / B", action: "Value / corner / center / highlight / line" },
  { section: "Grid entry", keys: "Arrow keys", action: "Move selection" },
  { section: "Grid entry", keys: "Shift + arrow", action: "Extend selection" },
  { section: "Grid entry", keys: "1–9 / Backspace", action: "Enter or clear selected values" },
  { section: "Objects", keys: "Ctrl/Cmd + C / V", action: "Copy / paste selected objects" },
  { section: "Objects", keys: "Ctrl/Cmd + A", action: "Select all objects in the active tool" },
  { section: "Objects", keys: "Delete", action: "Delete selected objects" },
];

export function CreatorKeyboardHelp(props: { onClose: () => void }) {
  return <CreatorModal title="Creator keyboard shortcuts" onClose={props.onClose} className="creatorUxHelpDialog">
    <div className="creatorUxShortcutList">
      {shortcuts.map((item, i) => <div className="creatorUxShortcutRow" key={i}><span>{item.section}</span><kbd>{item.keys}</kbd><span>{item.action}</span></div>)}
      <p className="creatorUxShortcutNote">Shortcuts are disabled while typing in a field. Grid-entry shortcuts apply only when the matching editor controls are active.</p>
    </div>
  </CreatorModal>;
}
