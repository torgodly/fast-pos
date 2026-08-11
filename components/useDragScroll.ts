"use client";

import { useEffect, useRef } from "react";

/** Finger/pen/mouse drag scrolls a panel even when the gesture starts on a button. */
export function useDragScroll<T extends HTMLElement>(axis: "y" | "x" = "y") {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

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
      origin = axis === "y" ? el.scrollTop : el.scrollLeft;
      el.setPointerCapture(event.pointerId);
    }

    function onMove(event: PointerEvent) {
      if (!active) return;
      const current = axis === "y" ? event.clientY : event.clientX;
      const delta = current - start;
      if (!moved && Math.abs(delta) < threshold) return;
      moved = true;
      event.preventDefault();
      if (axis === "y") el.scrollTop = origin - delta;
      else el.scrollLeft = origin - delta;
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

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove, { passive: false });
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick, true);

    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, [axis]);

  return ref;
}
