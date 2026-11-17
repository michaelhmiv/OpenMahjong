/** UTF-8 transport size without a Node or DOM dependency. JSON.stringify
 * escapes isolated surrogates before this function sees them. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}
