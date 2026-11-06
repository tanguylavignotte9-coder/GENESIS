export function fnv1a64(texte: string): string {
  let h1 = 0xcbf29ce4;
  let h2 = 0x84222325;
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    h1 = Math.imul(h1 ^ (c & 0xff), 0x01000193);
    h2 = Math.imul(h2 ^ (c >>> 8), 0x01000193);
    h2 = (h2 ^ h1) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export function empreinteOctets(vue: ArrayBufferView): string {
  const octets = new Uint8Array(vue.buffer, vue.byteOffset, vue.byteLength);
  let h1 = 0xcbf29ce4;
  let h2 = 0x84222325;
  for (let i = 0; i < octets.length; i++) {
    h1 = Math.imul(h1 ^ octets[i], 0x01000193);
    h2 = Math.imul(h2 ^ octets[(i * 7) % octets.length], 0x01000193);
    h2 = (h2 ^ h1) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
