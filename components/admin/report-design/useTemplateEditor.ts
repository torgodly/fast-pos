"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { templatesEqual } from "@/lib/print/templates/schema";
import type { ReportTemplate } from "@/lib/print/templates/types";

export type EditorCommitOptions = { coalesceKey?: string };

export type TemplateEditor = {
  template: ReportTemplate;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  commit: (next: ReportTemplate, options?: EditorCommitOptions) => void;
  undo: () => void;
  redo: () => void;
  replace: (next: ReportTemplate) => void;
  markSaved: (saved: ReportTemplate) => void;
};

type History = {
  past: ReportTemplate[];
  present: ReportTemplate;
  future: ReportTemplate[];
};

// `pushed` records whether this coalescing chain owns a step in `past` (the
// state before its first real commit). Merging rewrites `present` only while
// that boundary exists, otherwise it would replace the present without a step
// and `undo` would skip past the chain to an older state.
type CoalesceState = { key: string; at: number; pushed: boolean };

const HISTORY_LIMIT = 50;
const COALESCE_MS = 500;

function clone(template: ReportTemplate): ReportTemplate {
  return JSON.parse(JSON.stringify(template)) as ReportTemplate;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  ) {
    return true;
  }
  // jsdom does not implement isContentEditable, so fall back to the attribute.
  return (
    target.isContentEditable ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
}

export function useTemplateEditor(initial: ReportTemplate): TemplateEditor {
  const [baseline, setBaseline] = useState(() => clone(initial));
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: clone(initial),
    future: [],
  }));
  const coalesceRef = useRef<CoalesceState | null>(null);

  const present = history.present;
  const dirty = useMemo(
    () => !templatesEqual(present, baseline),
    [present, baseline],
  );

  const push = useCallback(
    (state: History, next: ReportTemplate): History => ({
      past: [...state.past, state.present].slice(-HISTORY_LIMIT),
      present: clone(next),
      future: [],
    }),
    [],
  );

  const commit = useCallback(
    (next: ReportTemplate, options?: EditorCommitOptions) => {
      const key = options?.coalesceKey;
      const now = Date.now();
      const previous = coalesceRef.current;
      const merge =
        key !== undefined &&
        previous !== null &&
        previous.key === key &&
        previous.pushed &&
        now - previous.at < COALESCE_MS;
      // Provisional marker: this call has not pushed a boundary yet. The
      // updater below promotes it once (and only if) it records a step.
      coalesceRef.current =
        key !== undefined ? { key, at: now, pushed: false } : null;
      setHistory((state) => {
        if (templatesEqual(state.present, next)) return state;
        if (key !== undefined) {
          coalesceRef.current = { key, at: now, pushed: true };
        }
        if (merge) return { ...state, present: clone(next), future: [] };
        return push(state, next);
      });
    },
    [push],
  );

  const undo = useCallback(() => {
    coalesceRef.current = null;
    setHistory((state) => {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
      };
    });
  }, []);

  const redo = useCallback(() => {
    coalesceRef.current = null;
    setHistory((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: next,
        future: state.future.slice(1),
      };
    });
  }, []);

  const replace = useCallback(
    (next: ReportTemplate) => {
      coalesceRef.current = null;
      setHistory((state) => {
        if (templatesEqual(state.present, next)) return state;
        return push(state, next);
      });
    },
    [push],
  );

  const markSaved = useCallback((saved: ReportTemplate) => {
    coalesceRef.current = null;
    setBaseline(clone(saved));
  }, []);

  const lastPropRef = useRef(initial);

  useEffect(() => {
    if (dirty) return;
    if (templatesEqual(lastPropRef.current, initial)) return;
    lastPropRef.current = clone(initial);
    // A save echoes the template back through props; that is what is already on
    // screen, so adopting it would silently wipe undo/redo. Only a genuinely
    // different prop takes the adoption branch.
    if (templatesEqual(initial, present)) return;
    const next = clone(initial);
    setBaseline(next);
    setHistory({ past: [], present: next, future: [] });
  }, [initial, dirty, present]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTextEntryTarget(event.target)) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  return {
    template: present,
    dirty,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    commit,
    undo,
    redo,
    replace,
    markSaved,
  };
}
