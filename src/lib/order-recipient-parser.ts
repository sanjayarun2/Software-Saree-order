export type ParsedRecipientDetails = {
  customerName: string;
  addressLines: string[];
  itemLines: string[];
  webOrderRef: string | null;
};

/** Parse free-text recipient_details from manual or legacy website orders. */
export function parseRecipientDetails(text: string): ParsedRecipientDetails {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const customerName = lines[0] ?? "";
  const addressLines: string[] = [];
  const itemLines: string[] = [];
  let webOrderRef: string | null = null;
  let inItems = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === "---") {
      inItems = true;
      continue;
    }
    if (/^items:?$/i.test(line)) {
      inItems = true;
      continue;
    }
    if (/^web\s*#/i.test(line)) {
      webOrderRef = line.replace(/^web\s*#\s*/i, "").trim() || line;
      continue;
    }
    if (inItems) {
      itemLines.push(line);
    } else {
      addressLines.push(line);
    }
  }

  return { customerName, addressLines, itemLines, webOrderRef };
}

export function formatAddressBlock(lines: string[]): string {
  return lines.filter(Boolean).join("\n");
}
