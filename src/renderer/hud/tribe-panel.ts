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
    const items = roster.names.map((name, p) => {
      const item = document.createElement('li');
      const alive = (humans.flags[p]! & HumanFlag.Alive) !== 0;
      const age = Math.floor(roster.ageYears[p]!);
      item.textContent = `${name}, ${age} an${age > 1 ? 's' : ''} — ${alive ? roster.actionLabels[humans.action[p]!] : roster.female[p] ? 'morte' : 'mort'}`;
      if (!alive) item.className = 'dead';
      item.addEventListener('click', () => this.onSelect(p));
      return item;
    });
    this.list.replaceChildren(...items);
  }
}
