/** Keep unified-diff range metadata and omit the trailing code context. */
export function hunkLabel(header: string): string {
  return header.match(/^(@@+).*?\1/)?.[0] ?? "@@";
}
