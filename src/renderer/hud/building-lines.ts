import type { BuildingDetails, ItemLine, LifeTables } from '../../shared/messages';

const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const fr1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const PERCENT = 100;
const STATES = ['Chantier', 'Construit', 'Abandonné'];
/** Lines of a stock shown in the tooltip (the panel shows them all). */
const TOOLTIP_ITEMS = 5;

export function buildingName(details: BuildingDetails, tables: LifeTables): string {
  return tables.buildings[details.type]?.name ?? '?';
}

/** "Baies : 12 (qualité 45 %)" */
export function itemText(line: ItemLine, tables: LifeTables): string {
  const name = tables.items[line.item]?.name ?? '?';
  return `${name} : ${line.qty < 10 ? fr1.format(line.qty) : fr.format(line.qty)} (qualité ${fr.format(line.quality * PERCENT)} %)`;
}

/** State in one line: "Chantier : 40 %", "Construit", "Abandonné". */
export function stateText(details: BuildingDetails): string {
  if (details.state === 0) return `Chantier : ${fr.format(details.progress * PERCENT)} %`;
  return STATES[details.state] ?? '';
}

/** The facts that matter for this building (fire, beds, field, materials of a site). */
export function factLines(details: BuildingDetails): string[] {
  const lines: string[] = [];
  if (details.state === 0) {
    for (const material of details.materials) lines.push(`${material.name} : ${fr.format(material.delivered)} / ${fr.format(material.needed)}`);
    lines.push(`Travail : ${fr1.format(details.workDone)} / ${fr1.format(details.workNeeded)} h`);
    return lines;
  }
  if (details.fuelMax > 0) lines.push(details.fuel > 0 ? `Feu : ${fr.format(details.fuel)} h de bois sur ${fr.format(details.fuelMax)}` : 'Feu éteint');
  if (details.sleeps > 0) lines.push(`Dorment ici : ${details.residents.length} / ${details.sleeps}`);
  if (details.crop) {
    const { sown, growth, growthDays, grain } = details.crop;
    lines.push(grain > 0 ? `Récolte à faire : ${fr.format(grain)} céréales` : sown > 0 ? `Semé : ${fr.format(growth)} / ${fr.format(growthDays)} jours de pousse` : 'En friche');
  }
  if (details.state === 1) lines.push(`Qualité : ${fr.format(details.quality * PERCENT)} %`);
  return lines;
}

/** Tooltip: name, state, facts, the main goods of the stock. */
export function buildingTooltip(details: BuildingDetails, tables: LifeTables): string[] {
  const lines = [buildingName(details, tables), stateText(details), ...factLines(details)];
  if (details.stock) {
    const stock = [...details.stock].sort((a, b) => b.qty - a.qty);
    lines.push(stock.length === 0 ? 'Stock commun : vide' : `Stock commun (${stock.length} sortes) :`);
    for (const line of stock.slice(0, TOOLTIP_ITEMS)) lines.push(`  ${itemText(line, tables)}`);
    if (stock.length > TOOLTIP_ITEMS) lines.push('  …');
  }
  lines.push('Clic (ou Maj+clic) : ouvrir sa fiche');
  return lines;
}
