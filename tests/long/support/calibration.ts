/**
 * Speed of this machine, measured on a fixed reference computation (no simulation code), so that
 * performance tests compare the simulation to the machine instead of to an absolute number of
 * milliseconds that depends on the server of the day.
 *
 * The reference mixes what a game day does: loops over typed arrays with floating point maths,
 * small objects created and dropped, Map lookups and a sort. Its result is used (returned) so that
 * nothing can be optimised away.
 */
function referenceWork(): number {
  const size = 1 << 16;
  const values = new Float32Array(size);
  const counts = new Uint16Array(size);
  let seed = 12345;
  for (let k = 0; k < size; k++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    values[k] = (seed & 0xffff) / 0xffff;
  }
  let acc = 0;
  for (let pass = 0; pass < 40; pass++) {
    for (let k = 0; k < size; k++) {
      const v = values[k]!;
      const next = Math.sqrt(v * v + 0.5) * Math.sin(v + pass) + Math.exp(-v);
      values[k] = next - Math.floor(next);
      counts[k] = (counts[k]! + (next > 1 ? 1 : 0)) & 0xffff;
      acc += next;
    }
  }
  const map = new Map<number, { x: number; y: number }>();
  for (let k = 0; k < 200_000; k++) {
    const key = (k * 7919) % 50_021;
    const found = map.get(key);
    if (found) found.x += k;
    else map.set(key, { x: k, y: key });
  }
  const list = [...map.values()].sort((a, b) => (a.x % 977) - (b.x % 977) || a.y - b.y);
  return acc + list.length + (list[0]?.x ?? 0) + (counts[7] ?? 0);
}

/** Milliseconds of the reference computation on this machine: the best of several runs (the least disturbed). */
export function machineReferenceMs(runs = 5): number {
  referenceWork(); // warm-up (compilation)
  let best = Infinity;
  let sink = 0;
  for (let k = 0; k < runs; k++) {
    const started = performance.now();
    sink += referenceWork();
    best = Math.min(best, performance.now() - started);
  }
  if (!Number.isFinite(sink)) throw new Error('calcul de référence invalide');
  return best;
}
