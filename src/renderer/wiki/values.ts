/**
 * Variables cited by the Wiki ({var:fichier.json:clé}): their current value in the workshop
 * (modifications included), written for the player with their unit. Before the first answer of the
 * simulation, the default values of the data files are used.
 */
import { defaultRawData, type RawGameData } from '../../sim/core/game-data';
import { buildCatalog, cloneRaw, setAt, type VariableValue } from '../../sim/core/variables';
import type { WorkshopVariable } from '../../sim/core/workshop';

/** Units shown as a percentage. */
const PERCENT_UNITS = new Set(['fraction', 'probabilité']);
/** Units not written after the value. */
const SILENT_UNITS = new Set(['texte', 'choix', 'oui / non', 'sans unité', 'facteur', 'poids']);

export function variableId(file: string, key: string): string {
  return `${file}:${key}`;
}

/** The variables of the default data files (before the workshop answered). */
export function defaultVariables(): WorkshopVariable[] {
  const defaults = defaultRawData();
  return buildCatalog(defaults, defaults);
}

function number(value: number): string {
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 1000) / 1000;
  return rounded.toLocaleString('fr-FR', { maximumFractionDigits: 3 }).replace(/ | /g, ' ');
}

/** A value written for the player: "2,5 points/heure", "35 %", "oui", "Loup". */
export function formatVariable(variable: Pick<WorkshopVariable, 'unit'>, value: VariableValue): string {
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  if (typeof value === 'string') return value;
  if (PERCENT_UNITS.has(variable.unit)) return `${number(value * 100)} %`;
  if (SILENT_UNITS.has(variable.unit)) return number(value);
  return `${number(value)} ${variable.unit}`;
}

/** The content of the data files with the workshop's values (for the generated pages). */
export function rawFromVariables(variables: readonly WorkshopVariable[]): RawGameData {
  const raw = cloneRaw(defaultRawData());
  for (const variable of variables) setAt(raw[variable.dataKey], variable.path, variable.value);
  return raw;
}
