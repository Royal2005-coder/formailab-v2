const COMPILED_ID_PATTERN = /^al(?:[bqev]|a|l|c|o|r|mr|mc)g[0-9a-f]+g(?:[0-9a-f]+g)*([0-9a-f]+)$/i;

export const formatIdForDisplay = (id: string | number): string | number => {
  if (typeof id !== "string") return id;

  const encodedExternalId = id.match(COMPILED_ID_PATTERN)?.[1];
  if (!encodedExternalId || encodedExternalId.length % 2 !== 0) return id;

  try {
    const bytes = Uint8Array.from(encodedExternalId.match(/.{2}/g) ?? [], (byte) =>
      Number.parseInt(byte, 16)
    );
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return decoded && /^[\x20-\x7E]+$/.test(decoded) ? decoded : id;
  } catch {
    return id;
  }
};
