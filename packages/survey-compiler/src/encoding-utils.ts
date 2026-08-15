const CP1252_BYTE_MAP: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/**
 * Repairs double-encoded UTF-8 strings or CP1252/ISO-8859-1 mis-decoded Vietnamese text
 * (e.g., turning "káº¿t há»£p nhiá»u cÃ´ng cá»¥" back into "kết hợp nhiều công cụ").
 */
export const repairCorruptedEncoding = (text: string): string => {
  if (!text || typeof text !== "string") return text;

  // Some spreadsheet/CSV paths strip the CP1252 control byte used by "ề".
  let repaired = text.replaceAll("á»u", "á»\u0081u");
  for (let pass = 0; pass < 3; pass += 1) {
    // A source may have crossed the UTF-8/CP1252 boundary more than once.
    if (!/[\u00C2\u00C3\u00E1\u00C4\u00C5]/.test(repaired)) break;

    try {
      const bytes: number[] = [];
      for (let i = 0; i < repaired.length; i++) {
        const code = repaired.charCodeAt(i);
        if (code in CP1252_BYTE_MAP) {
          bytes.push(CP1252_BYTE_MAP[code]);
        } else if (code <= 0xff) {
          bytes.push(code);
        } else {
          return repaired;
        }
      }
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
      if (decoded === repaired) break;
      repaired = decoded;
    } catch {
      break;
    }
  }
  return repaired;
};
