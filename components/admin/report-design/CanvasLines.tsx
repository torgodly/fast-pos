"use client";

import type { LayoutLine, TextSize } from "@/lib/print/templates/types";

export const TEXT_SIZE: Record<TextSize, number> = {
  small: 11,
  normal: 12,
  large: 14,
  xlarge: 16,
};

export function CanvasLines({ lines }: { lines: LayoutLine[] }) {
  return (
    <div className="space-y-0.5">
      {lines.map((line, index) => {
        if (line.kind === "separator") {
          return (
            <hr key={index} className="my-1 border-dashed border-neutral-400" />
          );
        }
        if (line.kind === "logo") {
          return (
            <div
              key={index}
              className="my-1 text-center text-[10px] text-neutral-400"
            >
              [شعار]
            </div>
          );
        }
        if (line.kind === "columns") {
          return (
            <div key={index} className="flex flex-row gap-1">
              {line.cells.map((cell, cellIndex) => (
                <span
                  key={cellIndex}
                  className="truncate"
                  style={{
                    flex: line.widths[cellIndex] ?? 1,
                    textAlign: cell.align,
                    fontWeight: cell.bold ? 800 : 400,
                    fontSize: TEXT_SIZE[cell.size],
                  }}
                >
                  {cell.text}
                </span>
              ))}
            </div>
          );
        }
        return (
          <p
            key={index}
            style={{
              textAlign: line.align,
              fontWeight: line.bold ? 800 : 400,
              fontSize: TEXT_SIZE[line.size],
            }}
          >
            {line.text}
          </p>
        );
      })}
    </div>
  );
}
