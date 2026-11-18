/**
 * Common objects are kept in piles: an item type, a quantity, a quality (0..1) and an owner.
 * Two piles of the same item and owner merge (their qualities average, weighted by quantity).
 */

/** Owner of a pile: a person (id >= 0) or a camp's community (encoded as -1 - camp). */
export type Owner = number;

export function campOwner(camp: number): Owner {
  return -1 - camp;
}

export function ownerCamp(owner: Owner): number {
  return owner < 0 ? -1 - owner : -1;
}

export interface Pile {
  item: number;
  qty: number;
  quality: number;
  owner: Owner;
}

/**
 * Remarkable objects are unique: a name, a creator and a history (journal events). None appears
 * yet (they will be made by masters, chiefs and priests), but their place is ready.
 */
export interface RemarkableItem {
  id: number;
  item: number;
  name: string;
  creator: number;
  owner: Owner;
  quality: number;
  createdTick: number;
  /** Journal events of its life (made, given, stolen, lost…). */
  history: number[];
}

/** What was taken from an inventory: quantity and its (mean) quality. */
export interface Taken {
  qty: number;
  quality: number;
}

export class Inventory {
  readonly piles: Pile[] = [];

  /** Adds `qty` of an item; merges with the pile of the same item and owner. */
  put(item: number, qty: number, quality: number, owner: Owner): void {
    if (qty <= 0) return;
    const pile = this.piles.find((p) => p.item === item && p.owner === owner);
    if (pile) {
      pile.quality = (pile.quality * pile.qty + quality * qty) / (pile.qty + qty);
      pile.qty += qty;
    } else this.piles.push({ item, qty, quality, owner });
  }

  /** Takes up to `qty` of an item (best quality first), whatever its owner. */
  take(item: number, qty: number): Taken {
    let taken = 0;
    let qualitySum = 0;
    while (taken < qty) {
      let best = -1;
      for (let k = 0; k < this.piles.length; k++) {
        const pile = this.piles[k]!;
        if (pile.item === item && pile.qty > 0 && (best < 0 || pile.quality > this.piles[best]!.quality)) best = k;
      }
      if (best < 0) break;
      const pile = this.piles[best]!;
      const part = Math.min(qty - taken, pile.qty);
      pile.qty -= part;
      taken += part;
      qualitySum += part * pile.quality;
      if (pile.qty <= 1e-9) this.piles.splice(best, 1);
    }
    return { qty: taken, quality: taken > 0 ? qualitySum / taken : 0 };
  }

  count(item: number): number {
    let total = 0;
    for (const pile of this.piles) if (pile.item === item) total += pile.qty;
    return total;
  }

  /** Best quality of an item held (-1 if none): the tool someone works with. */
  bestQuality(item: number): number {
    let best = -1;
    for (const pile of this.piles) if (pile.item === item && pile.qty >= 1 - 1e-9 && pile.quality > best) best = pile.quality;
    return best;
  }

  /** Total room taken, given the bulk of each item type. */
  bulk(bulkOf: Float64Array): number {
    let total = 0;
    for (const pile of this.piles) total += pile.qty * bulkOf[pile.item]!;
    return total;
  }

  /** Total food value, given the food value of each item type. */
  food(foodOf: Float64Array): number {
    let total = 0;
    for (const pile of this.piles) total += pile.qty * foodOf[pile.item]!;
    return total;
  }

  /** Removes the piles smaller than `min` (crumbs). */
  dropCrumbs(min: number): void {
    for (let k = this.piles.length - 1; k >= 0; k--) if (this.piles[k]!.qty < min) this.piles.splice(k, 1);
  }

  get isEmpty(): boolean {
    return this.piles.length === 0;
  }
}
