"use client";

import { useEffect, useRef } from "react";

/** Finger/pen/mouse drag scrolls a panel even when the gesture starts on a button. */
export function useDragScroll<T extends HTMLElement>(axis: "y" | "x" = "y") {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const scroller: HTMLElement = node;

    let active = false;
    let moved = false;
    let start = 0;
    let origin = 0;
    const threshold = 7;

    function onDown(event: PointerEvent) {
      if (event.button !== 0) return;
      active = true;
      moved = false;
      start = axis === "y" ? event.clientY : event.clientX;
      origin = axis === "y" ? scroller.scrollTop : scroller.scrollLeft;
      scroller.setPointerCapture(event.pointerId);
    }

    function onMove(event: PointerEvent) {
      if (!active) return;
      const current = axis === "y" ? event.clientY : event.clientX;
      const delta = current - start;
      if (!moved && Math.abs(delta) < threshold) return;
      moved = true;
      event.preventDefault();
      if (axis === "y") scroller.scrollTop = origin - delta;
      else scroller.scrollLeft = origin - delta;
    }

    function onUp() {
      active = false;
    }

    function onClick(event: Event) {
      if (!moved) return;
      event.preventDefault();
      event.stopPropagation();
      moved = false;
    }

    scroller.addEventListener("pointerdown", onDown);
    scroller.addEventListener("pointermove", onMove, { passive: false });
    scroller.addEventListener("pointerup", onUp);
    scroller.addEventListener("pointercancel", onUp);
    scroller.addEventListener("click", onClick, true);

    return () => {
      scroller.removeEventListener("pointerdown", onDown);
      scroller.removeEventListener("pointermove", onMove);
      scroller.removeEventListener("pointerup", onUp);
      scroller.removeEventListener("pointercancel", onUp);
      scroller.removeEventListener("click", onClick, true);
    };
  }, [axis]);

  return ref;
}
