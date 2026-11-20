/**
 * Copies a whole object graph (the simulation) to bytes and back, exactly: shared references stay
 * shared, typed arrays keep their bytes, Maps and Sets keep their order, class instances get their
 * class back. Nothing is recomputed on loading, so a restored world continues exactly like the
 * original one.
 *
 * Layout of the bytes: [u32 length of the JSON][JSON of the nodes][padding to 8][array buffers].
 * Class instances are named through a registry of stable keys (never `constructor.name`, which a
 * minified build may change). A class may name in `transientKeys()` the own properties that are
 * not saved (callbacks bound to an instance, registries of callbacks): it rebuilds them in its
 * `afterLoad()` method, called once the whole graph is restored. Any other function is refused.
 */
import { decodeUtf8, encodeUtf8 } from './text-codec';

/** A class whose instances may be saved. */
// The registry only needs the prototype: constructor arguments do not matter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SavableClass = abstract new (...args: any[]) => unknown;

/** Stable key → class. A key must never change once saves exist (bump the save format instead). */
export type ClassRegistry = Readonly<Record<string, SavableClass>>;

/** Error with a French message, shown to the player. */
export class SaveError extends Error {}

type Value = number | string | boolean | null | { r: number } | { u: 1 } | { n: string } | { h: 1 };

type GraphNode =
  | { k: 'o'; c: string; p: Record<string, Value> }
  | { k: 'a'; v: Value[] }
  | { k: 'm'; v: [Value, Value][] }
  | { k: 's'; v: Value[] }
  | { k: 'b'; o: number; n: number }
  | { k: 't'; c: string; b: number; o: number; n: number };

const PLAIN = 'Object';
const NULL_PROTO = 'null';
const AFTER_LOAD = 'afterLoad';
const TRANSIENT_KEYS = 'transientKeys';
const ALIGN = 8;
const HEADER_BYTES = 4;

type TypedArrayCtor =
  | Int8ArrayConstructor
  | Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Int16ArrayConstructor
  | Uint16ArrayConstructor
  | Int32ArrayConstructor
  | Uint32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor;

const TYPED_ARRAYS: Readonly<Record<string, TypedArrayCtor>> = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
};
const TYPED_BY_PROTO = new Map<object, string>(Object.entries(TYPED_ARRAYS).map(([name, ctor]) => [ctor.prototype, name]));

type TypedArray = InstanceType<TypedArrayCtor>;

function specialNumber(value: number): Value | null {
  if (Number.isNaN(value)) return { n: 'NaN' };
  if (value === Infinity) return { n: 'Inf' };
  if (value === -Infinity) return { n: '-Inf' };
  if (Object.is(value, -0)) return { n: '-0' };
  return null;
}

const SPECIAL: Readonly<Record<string, number>> = { NaN: NaN, Inf: Infinity, '-Inf': -Infinity, '-0': -0 };

/** Own keys a class asks not to save (see the file comment). */
function transientOf(value: object): readonly string[] | null {
  const method = (value as Record<string, unknown>)[TRANSIENT_KEYS];
  return typeof method === 'function' ? (method.call(value) as readonly string[]) : null;
}

function align(offset: number): number {
  return Math.ceil(offset / ALIGN) * ALIGN;
}

/** Serializes everything reachable from `root`. Throws a SaveError naming the first unsavable value. */
export function writeGraph(root: object, classes: ClassRegistry): Uint8Array {
  const keyOf = new Map<object, string>();
  for (const [key, ctor] of Object.entries(classes)) keyOf.set(ctor.prototype as object, key);
  const ids = new Map<object, number>();
  const pending: { value: object; path: string }[] = [];
  const nodes: GraphNode[] = [];
  const buffers: ArrayBuffer[] = [];
  let blobBytes = 0;

  const refer = (value: object, path: string): Value => {
    let id = ids.get(value);
    if (id === undefined) {
      id = ids.size;
      ids.set(value, id);
      pending.push({ value, path });
    }
    return { r: id };
  };
  const encode = (value: unknown, path: string): Value => {
    switch (typeof value) {
      case 'number':
        return specialNumber(value) ?? value;
      case 'string':
      case 'boolean':
        return value;
      case 'undefined':
        return { u: 1 };
      case 'object':
        return value === null ? null : refer(value, path);
      default:
        throw new SaveError(`Sauvegarde impossible : valeur non enregistrable (${typeof value}) en ${path}.`);
    }
  };

  refer(root, 'monde');
  for (let next = 0; next < pending.length; next++) {
    const { value, path } = pending[next]!;
    nodes.push(encodeNode(value, path));
  }

  function encodeNode(value: object, path: string): GraphNode {
    if (Array.isArray(value)) {
      const items: Value[] = new Array<Value>(value.length);
      for (let i = 0; i < value.length; i++) items[i] = i in value ? encode(value[i], `${path}[${i}]`) : { h: 1 };
      return { k: 'a', v: items };
    }
    if (value instanceof Map) {
      const entries: [Value, Value][] = [];
      for (const [key, item] of value) entries.push([encode(key, `${path}.clé`), encode(item, `${path}.valeur`)]);
      return { k: 'm', v: entries };
    }
    if (value instanceof Set) {
      const items: Value[] = [];
      for (const item of value) items.push(encode(item, `${path}.élément`));
      return { k: 's', v: items };
    }
    if (value instanceof ArrayBuffer) {
      const offset = align(blobBytes);
      blobBytes = offset + value.byteLength;
      buffers.push(value);
      return { k: 'b', o: offset, n: value.byteLength };
    }
    const proto = Object.getPrototypeOf(value) as object | null;
    const typed = proto ? TYPED_BY_PROTO.get(proto) : undefined;
    if (typed) {
      const array = value as TypedArray;
      const buffer = encode(array.buffer, `${path}.buffer`) as { r: number };
      return { k: 't', c: typed, b: buffer.r, o: array.byteOffset, n: array.length };
    }
    let className: string;
    if (proto === Object.prototype) className = PLAIN;
    else if (proto === null) className = NULL_PROTO;
    else {
      const key = keyOf.get(proto);
      if (key === undefined) {
        const name = (proto as { constructor?: { name?: string } }).constructor?.name ?? '?';
        throw new SaveError(`Sauvegarde impossible : classe « ${name} » non déclarée pour la sauvegarde (en ${path}).`);
      }
      className = key;
    }
    const props: Record<string, Value> = {};
    const transient = transientOf(value);
    for (const key of Object.keys(value)) {
      if (transient?.includes(key)) continue;
      const item = (value as Record<string, unknown>)[key];
      if (typeof item === 'function') {
        throw new SaveError(`Sauvegarde impossible : fonction « ${key} » en ${path} (à déclarer dans transientKeys() et à recréer dans afterLoad()).`);
      }
      props[key] = encode(item, `${path}.${key}`);
    }
    return { k: 'o', c: className, p: props };
  }

  const json = encodeUtf8(JSON.stringify(nodes));
  const blobStart = align(HEADER_BYTES + json.length);
  const out = new Uint8Array(blobStart + blobBytes);
  new DataView(out.buffer).setUint32(0, json.length, true);
  out.set(json, HEADER_BYTES);
  let index = 0;
  for (const node of nodes) {
    if (node.k !== 'b') continue;
    out.set(new Uint8Array(buffers[index++]!), blobStart + node.o);
  }
  return out;
}

/** Rebuilds the graph written by writeGraph. Throws a SaveError if the bytes are not a valid graph. */
export function readGraph(bytes: Uint8Array, classes: ClassRegistry): unknown {
  if (bytes.length < HEADER_BYTES) throw new SaveError('Sauvegarde illisible : fichier tronqué.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(0, true);
  if (HEADER_BYTES + jsonLength > bytes.length) throw new SaveError('Sauvegarde illisible : fichier tronqué.');
  let nodes: GraphNode[];
  try {
    nodes = JSON.parse(decodeUtf8(bytes.subarray(HEADER_BYTES, HEADER_BYTES + jsonLength))) as GraphNode[];
  } catch {
    throw new SaveError('Sauvegarde illisible : contenu abîmé.');
  }
  const blobStart = align(HEADER_BYTES + jsonLength);
  const objects: object[] = new Array<object>(nodes.length);
  const afterLoad: object[] = [];

  // First pass: every node exists (buffers before the typed arrays that use them).
  nodes.forEach((node, id) => {
    if (node.k === 'b') {
      if (blobStart + node.o + node.n > bytes.length) throw new SaveError('Sauvegarde illisible : fichier tronqué.');
      const buffer = new ArrayBuffer(node.n);
      new Uint8Array(buffer).set(bytes.subarray(blobStart + node.o, blobStart + node.o + node.n));
      objects[id] = buffer;
    }
  });
  nodes.forEach((node, id) => {
    switch (node.k) {
      case 'a':
        objects[id] = new Array<unknown>(node.v.length);
        return;
      case 'm':
        objects[id] = new Map();
        return;
      case 's':
        objects[id] = new Set();
        return;
      case 't': {
        const ctor = TYPED_ARRAYS[node.c];
        const buffer = objects[node.b];
        if (!ctor || !(buffer instanceof ArrayBuffer)) throw new SaveError('Sauvegarde illisible : tableau inconnu.');
        objects[id] = new ctor(buffer, node.o, node.n);
        return;
      }
      case 'o': {
        let proto: object | null;
        if (node.c === PLAIN) proto = Object.prototype;
        else if (node.c === NULL_PROTO) proto = null;
        else {
          const ctor = classes[node.c];
          if (!ctor) throw new SaveError(`Sauvegarde incompatible : classe « ${node.c} » inconnue de cette version du jeu.`);
          proto = ctor.prototype as object;
        }
        const created = Object.create(proto) as object;
        objects[id] = created;
        if (proto && typeof (proto as Record<string, unknown>)[AFTER_LOAD] === 'function') afterLoad.push(created);
        return;
      }
      case 'b':
        return;
    }
  });

  const decode = (value: Value): unknown => {
    if (value === null || typeof value !== 'object') return value;
    if ('r' in value) {
      const target = objects[value.r];
      if (target === undefined) throw new SaveError('Sauvegarde illisible : référence cassée.');
      return target;
    }
    if ('u' in value) return undefined;
    if ('n' in value) return SPECIAL[value.n];
    throw new SaveError('Sauvegarde illisible : valeur inconnue.');
  };

  // Second pass: contents.
  nodes.forEach((node, id) => {
    const target = objects[id]!;
    switch (node.k) {
      case 'a': {
        const array = target as unknown[];
        node.v.forEach((item, i) => {
          if (item !== null && typeof item === 'object' && 'h' in item) return;
          array[i] = decode(item);
        });
        return;
      }
      case 'm':
        for (const [key, item] of node.v) (target as Map<unknown, unknown>).set(decode(key), decode(item));
        return;
      case 's':
        for (const item of node.v) (target as Set<unknown>).add(decode(item));
        return;
      case 'o':
        for (const key of Object.keys(node.p)) {
          Object.defineProperty(target, key, { value: decode(node.p[key]!), writable: true, enumerable: true, configurable: true });
        }
        return;
      default:
        return;
    }
  });
  for (const object of afterLoad) (object as { afterLoad(): void }).afterLoad();
  if (objects.length === 0) throw new SaveError('Sauvegarde illisible : contenu vide.');
  return objects[0];
}
