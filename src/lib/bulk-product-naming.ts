/** Website product title: "{prefix} {stampedCode}" e.g. Soft Silks AB25052001 */
export function buildBulkProductName(namePrefix: string, stampedCode: string): string {
  const prefix = namePrefix.trim();
  const code = stampedCode.trim();
  if (!prefix) return code;
  if (!code) return prefix;
  return `${prefix} ${code}`;
}
