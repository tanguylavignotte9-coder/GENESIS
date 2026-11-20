/**
 * UTF-8 text to bytes and back. TextEncoder and TextDecoder are standard in every host the
 * simulation runs in (Node, the worker); the simulation's type settings (plain ECMAScript) do not
 * describe them, hence these few declarations.
 */
declare const TextEncoder: { new (): { encode(text: string): Uint8Array } };
declare const TextDecoder: { new (label?: string): { decode(bytes: Uint8Array): string } };

export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}
