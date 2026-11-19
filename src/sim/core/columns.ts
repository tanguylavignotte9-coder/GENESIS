/**
 * Stores of "one value per being" kept as parallel arrays (typed arrays, or plain arrays for
 * strings and paths) can grow: every array field of `target` gets the matching field of `fresh`
 * (a new store of the same class, made for the extra beings) appended. The fresh store carries the
 * default values, so the new slots start exactly like those of a newly constructed store.
 */
type TypedArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

function isTyped(value: unknown): value is TypedArray {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

export function appendColumns(target: object, fresh: object): void {
  // The fields are declared readonly for the rest of the code: only growth replaces them.
  const into = target as Record<string, unknown>;
  const from = fresh as Record<string, unknown>;
  for (const key of Object.keys(into)) {
    const current = into[key];
    const extra = from[key];
    if (isTyped(current) && isTyped(extra)) {
      const Ctor = current.constructor as new (length: number) => TypedArray;
      const grown = new Ctor(current.length + extra.length);
      grown.set(current);
      grown.set(extra, current.length);
      into[key] = grown;
    } else if (Array.isArray(current) && Array.isArray(extra)) {
      into[key] = current.concat(extra);
    }
  }
}

/** A typed array grown to `length`, new slots set to `fill`. */
export function grownTo<T extends TypedArray>(array: T, length: number, fill: number): T {
  if (array.length >= length) return array;
  const Ctor = array.constructor as new (length: number) => T;
  const grown = new Ctor(length);
  grown.set(array);
  grown.fill(fill, array.length);
  return grown;
}
