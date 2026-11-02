"use client";

const MODULES = Array.from({ length: 81 }, (_, index) => {
  const row = Math.floor(index / 9);
  const col = index % 9;
  return (row * 3 + col * 5 + ((row * col) % 4)) % 7 < 3;
});

export function QrBox({ size = 56 }: { size?: number }) {
  return (
    <svg
      role="img"
      aria-label="رمز QR"
      width={size}
      height={size}
      viewBox="0 0 9 9"
      className="mx-auto bg-white p-1"
    >
      {MODULES.map((dark, index) =>
        dark ? (
          <rect
            key={index}
            x={index % 9}
            y={Math.floor(index / 9)}
            width={1}
            height={1}
            fill="black"
          />
        ) : null,
      )}
    </svg>
  );
}
