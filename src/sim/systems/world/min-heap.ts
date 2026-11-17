/**
 * Binary min-heap of tile indices keyed by a priority.
 * Ties are broken by the smaller index, so the pop order is fully deterministic.
 */
export class MinHeap {
  private readonly items: Int32Array;
  private readonly keys: Float64Array;
  private count = 0;

  constructor(capacity: number) {
    this.items = new Int32Array(capacity);
    this.keys = new Float64Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  push(item: number, key: number): void {
    let i = this.count++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(item, key, this.items[parent] ?? 0, this.keys[parent] ?? 0)) break;
      this.items[i] = this.items[parent] ?? 0;
      this.keys[i] = this.keys[parent] ?? 0;
      i = parent;
    }
    this.items[i] = item;
    this.keys[i] = key;
  }

  /** Removes and returns the item with the smallest key. The heap must not be empty. */
  pop(): number {
    const top = this.items[0] ?? 0;
    const last = --this.count;
    const item = this.items[last] ?? 0;
    const key = this.keys[last] ?? 0;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      if (left >= last) break;
      const right = left + 1;
      let child = left;
      if (right < last && this.less(this.items[right] ?? 0, this.keys[right] ?? 0, this.items[left] ?? 0, this.keys[left] ?? 0)) {
        child = right;
      }
      if (!this.less(this.items[child] ?? 0, this.keys[child] ?? 0, item, key)) break;
      this.items[i] = this.items[child] ?? 0;
      this.keys[i] = this.keys[child] ?? 0;
      i = child;
    }
    this.items[i] = item;
    this.keys[i] = key;
    return top;
  }

  private less(itemA: number, keyA: number, itemB: number, keyB: number): boolean {
    return keyA < keyB || (keyA === keyB && itemA < itemB);
  }
}
