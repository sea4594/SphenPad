import { useCallback, useEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from "react";

type Point = { x: number; y: number };
type View = { zoom: number; pan: Point };
type Gesture = "edit" | "pan" | "pinch" | "block";
const MIN_ZOOM = 0.5, MAX_ZOOM = 4;
const editable = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest("input,textarea,select,[contenteditable='true']"));

/** Creator-only navigation. Gesture capture prevents a pan/pinch from finishing an editing gesture. */
export function useCreatorBoardNavigation(
  zoom: number, pan: Point, setZoom: Dispatch<SetStateAction<number>>, setPan: Dispatch<SetStateAction<Point>>,
  onFirstTouch?: () => void, onPinchStart?: () => void,
) {
  const [navigate, setNavigate] = useState(false);
  const view = useRef<View>({ zoom, pan });
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>("edit");
  const previous = useRef<{ center: Point; distance: number } | null>(null);
  const space = useRef(false);
  const hovered = useRef(false);
  const wheelHandler = useRef<(event: globalThis.WheelEvent) => void>(() => {});
  const frame = useRef<number | null>(null);
  const removeWheel = useRef<(() => void) | null>(null);
  // React delegates wheel listeners passively in some browsers; use a native
  // non-passive listener so trackpad panning never scrolls the entire page.
  const viewportRef = useCallback((element: HTMLDivElement | null) => {
    removeWheel.current?.(); removeWheel.current = null;
    if (!element) return;
    const listener = (event: globalThis.WheelEvent) => wheelHandler.current(event);
    element.addEventListener("wheel", listener, { passive: false });
    removeWheel.current = () => element.removeEventListener("wheel", listener);
  }, []);
  useEffect(() => { if (frame.current === null) view.current = { zoom, pan }; }, [zoom, pan]);
  useEffect(() => () => { if (frame.current !== null) window.cancelAnimationFrame(frame.current); }, []);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space" && hovered.current && !editable(event.target)) { space.current = true; event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const up = (event: KeyboardEvent) => { if (event.code === "Space") space.current = false; };
    const reset = () => { space.current = false; };
    window.addEventListener("keydown", down, true); window.addEventListener("keyup", up, true); window.addEventListener("blur", reset);
    return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); window.removeEventListener("blur", reset); };
  }, []);
  function emit(next: View) {
    view.current = next;
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      setZoom(view.current.zoom);
      setPan(view.current.pan);
    });
  }
  function zoomAt(factor: number, point: Point, rect: DOMRect) {
    const old = view.current;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, old.zoom * factor));
    const x = point.x - rect.left - rect.width / 2, y = point.y - rect.top - rect.height / 2;
    const ratio = nextZoom / old.zoom;
    emit({ zoom: nextZoom, pan: { x: x - (x - old.pan.x) * ratio, y: y - (y - old.pan.y) * ratio } });
  }
  function abortEditing(target: HTMLElement) {
    target.querySelector(".sphenpad-board-interaction")?.dispatchEvent(new Event("sphenpad:cancel-interaction"));
  }
  const pair = () => {
    const points = [...pointers.current.values()];
    const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    return { center, distance: Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)) };
  };
  const handlers = {
    onPointerEnterCapture: () => { hovered.current = true; },
    onPointerLeaveCapture: () => { hovered.current = false; },
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
      // Toolbar controls belong to the viewport but are not board gestures.
      if (event.target instanceof Element && event.target.closest("button, input, select, textarea")) return;
      const isTouch = event.pointerType === "touch";
      const panButton = !isTouch && (event.button === 1 || (event.button === 0 && (navigate || space.current)));
      if (!isTouch && !panButton) return;
      if (isTouch && pointers.current.size === 0) onFirstTouch?.();
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (isTouch && pointers.current.size >= 2) {
        abortEditing(event.currentTarget);
        onPinchStart?.();
        gesture.current = "pinch"; previous.current = pair();
      } else if (panButton || (navigate && gesture.current !== "block")) {
        abortEditing(event.currentTarget);
        gesture.current = "pan";
      }
      if (gesture.current !== "edit") {
        if (panButton) event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault(); event.stopPropagation();
      }
    },
    onPointerMoveCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(event.pointerId)) return;
      const before = pointers.current.get(event.pointerId)!;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gesture.current === "pinch" && pointers.current.size >= 2) {
        const next = pair(), prev = previous.current ?? next;
        const rect = event.currentTarget.getBoundingClientRect();
        const old = view.current;
        const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, old.zoom * next.distance / prev.distance));
        const oldX = prev.center.x - rect.left - rect.width / 2, oldY = prev.center.y - rect.top - rect.height / 2;
        const nextX = next.center.x - rect.left - rect.width / 2, nextY = next.center.y - rect.top - rect.height / 2;
        const ratio = scale / old.zoom;
        emit({ zoom: scale, pan: { x: nextX - (oldX - old.pan.x) * ratio, y: nextY - (oldY - old.pan.y) * ratio } });
        previous.current = next;
      } else if (gesture.current === "pan") {
        const old = view.current;
        emit({ ...old, pan: { x: old.pan.x + event.clientX - before.x, y: old.pan.y + event.clientY - before.y } });
      }
      if (gesture.current !== "edit") { event.preventDefault(); event.stopPropagation(); }
    },
    onPointerUpCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(event.pointerId)) return;
      const wasNavigating = gesture.current !== "edit";
      pointers.current.delete(event.pointerId);
      if (pointers.current.size === 0) { gesture.current = "edit"; previous.current = null; }
      else if (gesture.current === "pinch") { gesture.current = "pan"; previous.current = null; }
      if (wasNavigating) { event.preventDefault(); event.stopPropagation(); }
    },
    onPointerCancelCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.delete(event.pointerId);
      if (!pointers.current.size) { gesture.current = "edit"; previous.current = null; }
      else gesture.current = "block";
      event.stopPropagation();
    },
  };
  useEffect(() => {
    wheelHandler.current = (event) => {
      const element = event.currentTarget;
      if (!(element instanceof HTMLDivElement)) return;
      event.preventDefault();
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      if (event.ctrlKey || event.metaKey) {
        zoomAt(Math.exp(-event.deltaY * multiplier * 0.004), { x: event.clientX, y: event.clientY }, element.getBoundingClientRect());
      } else {
        const current = view.current;
        emit({ ...current, pan: { x: current.pan.x - (event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX) * multiplier, y: current.pan.y - (event.shiftKey ? 0 : event.deltaY) * multiplier } });
      }
    };
  });
  return { navigate, setNavigate, viewportRef, handlers };
}
