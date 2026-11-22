import type { AnimalDetails, Inspection, LifeTables } from '../../shared/messages';

const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const PERCENT = 100;
const YOUNG_GROWTH = 0.33;
const ADULT_GROWTH = 0.9;

function resourceNames(life: LifeTables, ids: readonly string[]): string {
  return ids.map((id) => life.resources.resources.find((resource) => resource.id === id)?.name ?? id).join(', ');
}

function age(days: number, daysPerYear: number): string {
  const years = Math.floor(days / daysPerYear);
  if (years >= 1) return `${fr.format(years)} an${years > 1 ? 's' : ''}`;
  return `${fr.format(days)} jour${days > 1 ? 's' : ''}`;
}

/** Tooltip lines of an animal, in French. */
export function animalLines(animal: AnimalDetails, life: LifeTables, daysPerYear: number): string[] {
  const species = life.animals[animal.species];
  if (!species) return [];
  const sex = animal.female ? (animal.pregnant ? 'femelle, gestante' : 'femelle') : 'mâle';
  const lines = [
    `${species.name} (${sex})`,
    `Âge : ${age(animal.ageDays, daysPerYear)}`,
    `Faim : ${fr.format(animal.hunger)} % · Soif : ${fr.format(animal.thirst)} %`,
    `Réserves : ${fr.format(animal.reserves)} % · ${fr.format(animal.massKg)} kg`,
    `Santé : ${fr.format(animal.health)} %`,
    `État : ${life.animalStates[animal.state] ?? '?'}`,
  ];
  if (animal.groupSize > 1) lines.push(`Groupe : ${fr.format(animal.groupSize)} animaux`);
  if (animal.territory > 0) lines.push(`Territoire : ${fr.format(animal.territory)} tuiles de rayon`);
  lines.push(`Fournit : ${resourceNames(life, species.carcass.map((item) => item.resource))}`);
  if (animal.domestic) {
    const d = animal.domestic;
    lines.push(`Bête domestique (${d.name}) ${d.keeper}${d.tame < 1 ? ` · apprivoisée à ${fr.format(Math.round(d.tame * 100))} %` : ''}`);
  } else if (species.domesticable) lines.push('Domesticable');
  lines.push('Clic : suivre cet animal');
  return lines;
}

/** Extra tooltip lines of a tile: its plant, grass and fish. */
export function tileLifeLines(inspection: Inspection, life: LifeTables, daysPerYear: number): string[] {
  const lines: string[] = [];
  const plant = inspection.plant;
  const species = plant ? life.plants[plant.species] : undefined;
  if (plant && species) {
    const stage = plant.growth < YOUNG_GROWTH ? 'jeune pousse' : plant.growth < ADULT_GROWTH ? 'jeune' : 'adulte';
    lines.push(`Plante : ${species.name} (${stage}, ${age(plant.ageDays, daysPerYear)}) · santé ${fr.format(plant.health * PERCENT)} %`);
    if (species.produce) {
      const name = resourceNames(life, [species.produce.resource]);
      lines.push(plant.produce > 0 ? `Récolte : ${name} (${fr.format(plant.produce)})` : `${name} : pas en ce moment`);
    }
    if (species.materials?.length) lines.push(`Fournit : ${resourceNames(life, species.materials.map((item) => item.resource))}`);
  }
  if (inspection.grass > 0) lines.push(`Herbe : ${fr.format(inspection.grass)} %`);
  if (inspection.fish > 0) lines.push(`Poisson : ${fr.format(inspection.fish)}`);
  return lines;
}
