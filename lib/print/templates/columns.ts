export function distribute(weights: number[], total: number): number[] {
  if (weights.length === 0) return [];
  const safe = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 1,
  );
  const sum = safe.reduce((accumulator, weight) => accumulator + weight, 0);
  const exact = safe.map((weight) => (weight / sum) * total);
  const widths = exact.map((value) => Math.floor(value));
  let remainder = total - widths.reduce((accumulator, width) => accumulator + width, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    widths[order[cursor % order.length]!.index] += 1;
    remainder -= 1;
    cursor += 1;
  }
  return widths;
}

export function charWidths(weights: number[], columns: number): number[] {
  return distribute(weights, columns);
}

export function pixelWidths(weights: number[], total = 384): number[] {
  return distribute(weights, total);
}

export function pixelBounds(
  weights: number[],
  total = 384,
): Array<{ left: number; right: number; width: number }> {
  const widths = pixelWidths(weights, total);
  let offset = 0;
  return widths.map((width) => {
    const right = total - offset;
    const left = right - width;
    offset += width;
    return { left, right, width };
  });
}
