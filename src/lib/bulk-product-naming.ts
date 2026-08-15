/** Website product title: "{prefix} {stampedCode}" e.g. Soft Silks AB25052001 */
export function buildBulkProductName(namePrefix: string, stampedCode: string): string {
  const prefix = namePrefix.trim();
  const code = stampedCode.trim();
  if (!prefix) return code;
  if (!code) return prefix;
  return `${prefix} ${code}`;
}

/** Direct website upload (no overlay): keep prefix; number items when there are several. */
export function buildDirectBulkProductName(
  namePrefix: string,
  index: number,
  total: number
): string {
  const prefix = namePrefix.trim() || "Product";
  if (total <= 1) return prefix;
  return `${prefix} ${index + 1}`;
}
