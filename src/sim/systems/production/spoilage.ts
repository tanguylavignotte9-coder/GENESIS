import type { Inventory } from './inventory';
import type { ProductionParams } from './params';

/** Speed at which food spoils at a temperature (1 at the reference temperature, ×2 every `doublingCelsius`). */
export function spoilFactor(celsius: number, params: ProductionParams['spoilage']): number {
  const factor = Math.pow(2, (celsius - params.referenceCelsius) / params.doublingCelsius);
  return Math.min(params.maxFactor, Math.max(params.minFactor, factor));
}

/** `days` of spoiling for every pile of an inventory (each item at its own pace), then crumbs vanish. */
export function spoil(inventory: Inventory, days: number, factor: number, halfLife: Float64Array, minQuantity: number): void {
  for (const pile of inventory.piles) {
    const life = halfLife[pile.item]!;
    if (life > 0) pile.qty *= Math.pow(0.5, (days * factor) / life);
  }
  inventory.dropCrumbs(minQuantity);
}
