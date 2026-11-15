/** Keep range metadata, shortening each range separately so both signs stay visible. */
export function hunkLabel(header: string, maxWidth = Infinity): string {
  const label = header.match(/^(@@+).*?\1/)?.[0] ?? "@@";
  if (label.length <= maxWidth) return label;
  const marker = label.match(/^@+/)?.[0] ?? "@@";
  const ranges = label.match(/[+-]\d+(?:,\d+)?/g) ?? [];
  if (ranges.length === 0) return marker;
  const widths = ranges.map(range => range.length);
  const fixedWidth = marker.length * 2 + ranges.length + 1;
  while (fixedWidth + widths.reduce((sum, width) => sum + width, 0) > maxWidth) {
    const longest = Math.max(...widths);
    if (longest <= 2) break;
    const index = widths.indexOf(longest);
    widths[index] = longest - 1;
  }
  const shortened = ranges.map((range, index) => range.length <= widths[index]! ? range : `${range.slice(0, widths[index]! - 1)}…`);
  return `${marker} ${shortened.join(" ")} ${marker}`;
}
