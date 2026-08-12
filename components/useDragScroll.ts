"use client";

import { useEffect, useRef } from "react";

/** Finger/pen/mouse drag scrolls a panel; taps on buttons still click. */
export function useDragScroll<T extends HTMLElement>(axis: "y" | "x" = "y") {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const scroller: HTMLElement = node;

    let active = false;
    let dragging = false;
    let pointerId: number | null = null;
    let start = 0;
    let origin = 0;
    const threshold = 10;

    function onDown(event: PointerEvent) {
      if (event.button !== 0) return;
      active = true;
      dragging = false;
      pointerId = event.pointerId;
      start = axis === "y" ? event.clientY : event.clientX;
      origin = axis === "y" ? scroller.scrollTop : scroller.scrollLeft;
    }

    function onMove(event: PointerEvent) {
      if (!active || pointerId !== event.pointerId) return;
      const current = axis === "y" ? event.clientY : event.clientX;
      const delta = current - start;
      if (!dragging) {
        if (Math.abs(delta) < threshold) return;
        dragging = true;
        try {
          scroller.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      }
      event.preventDefault();
      if (axis === "y") scroller.scrollTop = origin - delta;
      else scroller.scrollLeft = origin - delta;
    }

    function onUp(event: PointerEvent) {
      if (pointerId !== event.pointerId) return;
      if (dragging) {
        try {
          scroller.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      }
      active = false;
      pointerId = null;
      // Keep dragging true through the following click event, then clear.
      if (dragging) {
        queueMicrotask(() => {
          dragging = false;
        });
      }
    }

    function onClick(event: Event) {
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
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
