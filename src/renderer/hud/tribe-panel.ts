import { HumanFlag, type HumansSnapshot, type Roster } from '../../shared/messages';

const REFRESH_MS = 1000;

/** "Tribu" panel: every member with age and current action; a click selects the person. */
export class TribePanel {
  private roster: Roster | null = null;
  private lastRender = 0;

  constructor(
    private readonly panel: HTMLElement,
    private readonly toggle: HTMLButtonElement,
    private readonly list: HTMLElement,
    private readonly onSelect: (person: number) => void,
  ) {
    toggle.addEventListener('click', () => {
      toggle.blur();
      panel.hidden = !panel.hidden;
      this.lastRender = 0;
    });
  }

  setRoster(roster: Roster): void {
    this.roster = roster;
    this.lastRender = 0;
  }

  update(humans: HumansSnapshot | null, now: number): void {
    const roster = this.roster;
    if (!roster || !humans) return;
    let living = 0;
    for (const flags of humans.flags) if (flags & HumanFlag.Alive) living++;
    this.toggle.textContent = `Tribu (${living})`;
    if (this.panel.hidden || now - this.lastRender < REFRESH_MS) return;
    this.lastRender = now;
    // The living first (the dead stay reachable from the journal and the family trees).
    const items: HTMLElement[] = [];
    let dead = 0;
    roster.names.forEach((name, p) => {
      const alive = (humans.flags[p]! & HumanFlag.Alive) !== 0;
      if (!alive) {
        dead++;
        return;
      }
      const item = document.createElement('li');
      const age = Math.floor(roster.ageYears[p]!);
      item.textContent = `${name}, ${age} an${age > 1 ? 's' : ''} — ${roster.actionLabels[humans.action[p]!]}`;
      item.addEventListener('click', () => this.onSelect(p));
      items.push(item);
    });
    if (dead > 0) {
      const item = document.createElement('li');
      item.className = 'dead';
      item.textContent = `… et ${dead} mort${dead > 1 ? 's' : ''} depuis le début (voir le journal et les arbres familiaux)`;
      items.push(item);
    }
    this.list.replaceChildren(...items);
  }
}
