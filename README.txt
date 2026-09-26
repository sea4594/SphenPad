SphenPad Phase 11L video-layout hotfix

Fixes:
1. Mobile/tablet portrait: opening the video player now immediately initializes the same explicit video/board sizing used by the slider, preventing the puzzle from disappearing or collapsing until the slider is touched.
2. Video resizing: native puzzle SVG strokes that previously used non-scaling-stroke now scale with the puzzle while video mode is active, so cell/region/cage borders shrink and grow with the board like an image. The interaction/selection overlay is intentionally left unchanged so its inside-grid selection geometry remains correct.
3. Desktop: when the video player is open, the five-row control panel is allowed to contract to the available viewport height instead of retaining the desktop 72px row minimum and clipping its bottom row.
4. Adds regression assertions for all three behaviors.

This overlay also retains the immediately preceding release-gate GridCanvas lint fix and fitted-board CSS.

Apply from ~/Downloads with:
  unzip -q SphenPad-phase11L-video-layout-hotfix.zip
  rsync -av ~/Downloads/SphenPad-phase11L-video-layout-hotfix/ ~/SphenPad-phase11-deploy/

Then run:
  cd ~/SphenPad-phase11-deploy
  npm run finish-phase11-release

Before pushing, also run npm run preview and verify the video-player behavior on portrait/mobile and desktop.
