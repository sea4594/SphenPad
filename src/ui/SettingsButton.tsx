import { memo, useState } from "react";
import { createPortal } from "react-dom";
import { IconSettings } from "./icons";
import { SettingsOverlay } from "./SettingsOverlay";

// Own this state outside heavy puzzle lists. Opening Settings should not force
// the entire visited page (including its preview collection) to rerender.
export const SettingsButton = memo(function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn topbarSettingsButton" onClick={() => setOpen(true)} title="Settings" type="button">
        <IconSettings />
      </button>
      {open ? createPortal(<SettingsOverlay onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
});
