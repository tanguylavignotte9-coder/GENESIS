import type { VariableValue } from '../../../sim/core/variables';
import type { WorkshopVariable } from '../../../sim/core/workshop';

/** Number of slider positions for a decimal variable. */
const SLIDER_STEPS = 1000;

export interface RowActions {
  set(variable: WorkshopVariable, value: VariableValue): void;
  reset(variable: WorkshopVariable): void;
  refuse(message: string): void;
}

const frNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 });

export function formatVariableValue(value: VariableValue): string {
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  if (typeof value === 'number') return frNumber.format(value);
  return value;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function boundsText(variable: WorkshopVariable): string {
  if (variable.min === undefined || variable.max === undefined) return '';
  return `Bornes : ${frNumber.format(variable.min)} à ${frNumber.format(variable.max)}`;
}

/** "0,5" or "0.5" → 0.5; null if not a number. */
function parseNumber(text: string): number | null {
  const value = Number(text.trim().replace(/\s/g, '').replace(',', '.'));
  return text.trim() === '' || !Number.isFinite(value) ? null : value;
}

function numberControl(variable: WorkshopVariable, actions: RowActions): HTMLElement {
  const box = el('div', 'var-control');
  const value = variable.value as number;
  const min = variable.min ?? Math.min(0, value);
  const max = variable.max ?? Math.max(1, value * 2);
  const slider = el('input', 'var-slider');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = variable.kind === 'integer' ? '1' : String((max - min) / SLIDER_STEPS);
  slider.value = String(value);
  const field = el('input', 'var-number');
  field.type = 'text';
  field.inputMode = 'decimal';
  field.value = formatVariableValue(value);
  const submit = (raw: number | null): void => {
    if (raw === null) {
      actions.refuse(`« ${variable.label} » : il faut un nombre.`);
      field.value = formatVariableValue(value);
      return;
    }
    const next = variable.kind === 'integer' ? Math.round(raw) : raw;
    if ((variable.min !== undefined && next < variable.min) || (variable.max !== undefined && next > variable.max)) {
      actions.refuse(`« ${variable.label} » : ${frNumber.format(next)} est hors bornes (${boundsText(variable).replace('Bornes : ', '')}) — valeur refusée.`);
      field.value = formatVariableValue(value);
      slider.value = String(value);
      return;
    }
    if (next !== value) actions.set(variable, next);
  };
  slider.addEventListener('input', () => (field.value = formatVariableValue(Number(slider.value))));
  slider.addEventListener('change', () => submit(Number(slider.value)));
  field.addEventListener('change', () => submit(parseNumber(field.value)));
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') field.blur();
  });
  if (variable.min !== undefined && variable.max !== undefined) box.append(slider);
  box.append(field);
  return box;
}

function otherControl(variable: WorkshopVariable, actions: RowActions): HTMLElement {
  const box = el('div', 'var-control');
  if (variable.kind === 'boolean') {
    const check = el('input', 'var-check');
    check.type = 'checkbox';
    check.checked = variable.value === true;
    check.addEventListener('change', () => actions.set(variable, check.checked));
    const label = el('label', 'var-check-label');
    label.append(check, document.createTextNode(check.checked ? ' oui' : ' non'));
    box.append(label);
  } else if (variable.kind === 'enum') {
    const select = el('select', 'var-select');
    for (const value of variable.values ?? []) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      option.selected = value === variable.value;
      select.append(option);
    }
    select.addEventListener('change', () => actions.set(variable, select.value));
    box.append(select);
  } else {
    const field = el('input', 'var-text');
    field.type = 'text';
    field.value = String(variable.value);
    field.addEventListener('change', () => {
      if (field.value !== variable.value) actions.set(variable, field.value);
    });
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') field.blur();
    });
    box.append(field);
  }
  return box;
}

/** One variable: label, legend, unit, bounds, current and default value, control and reset button. */
export function variableRow(variable: WorkshopVariable, actions: RowActions, showFile: boolean): HTMLElement {
  const changed = variable.value !== variable.defaultValue;
  const row = el('div', `var-row${changed ? ' changed' : ''}${variable.worldValue !== undefined ? ' waiting' : ''}`);
  const head = el('div', 'var-head');
  head.append(el('span', 'var-label', variable.label));
  if (variable.apply === 'newWorld') {
    const badge = el('span', 'var-badge', 'nouveau monde');
    badge.title = 'Cette variable sert à créer le monde : sa nouvelle valeur s’applique à la prochaine génération (bouton « Nouveau monde »).';
    head.append(badge);
  } else {
    const badge = el('span', 'var-badge live', 'en direct');
    badge.title = 'La modification s’applique tout de suite au monde en cours.';
    head.append(badge);
  }
  if (showFile) head.append(el('span', 'var-where', `${variable.system} › ${variable.file}${variable.section ? ` › ${variable.section}` : ''}`));
  row.append(head, el('div', 'var-help', variable.help));
  const meta = [`Unité : ${variable.unit}`, boundsText(variable), `Par défaut : ${formatVariableValue(variable.defaultValue)}`].filter((part) => part !== '');
  row.append(el('div', 'var-meta', meta.join(' · ')));
  const line = el('div', 'var-line');
  line.append(variable.kind === 'number' || variable.kind === 'integer' ? numberControl(variable, actions) : otherControl(variable, actions));
  const reset = el('button', 'var-reset', '↺');
  reset.type = 'button';
  reset.title = `Revenir à la valeur par défaut (${formatVariableValue(variable.defaultValue)})`;
  reset.disabled = !changed;
  reset.addEventListener('click', () => actions.reset(variable));
  line.append(reset);
  row.append(line);
  if (variable.worldValue !== undefined) {
    row.append(el('div', 'var-note', `Monde en cours : ${formatVariableValue(variable.worldValue)}. La nouvelle valeur s’appliquera au prochain monde.`));
  }
  return row;
}
