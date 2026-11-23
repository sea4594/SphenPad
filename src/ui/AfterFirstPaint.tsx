import { useEffect, useState, type ReactNode } from "react";

/**
 * Allow the browser to paint lightweight controls before mounting an expensive
 * SVG board. Once mounted the board stays mounted; ordinary edits, Settings,
 * resizing, and other state updates must not hide it again.
 */
export function AfterFirstPaint({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setReady(true));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, []);
  return ready ? <>{children}</> : null;
}
