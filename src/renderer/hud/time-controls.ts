/**
 * Date display + speed buttons (pause, x1…x500) + keyboard shortcuts:
 * Space = pause / resume, 1 to 5 = speeds.
 */
export class TimeControls {
  private buttons: HTMLButtonElement[] = [];
  private paused = false;
  private speedIndex = 0;

  constructor(
    private readonly dateElement: HTMLElement,
    private readonly speedsElement: HTMLElement,
    private readonly pauseButton: HTMLButtonElement,
    private readonly onPause: (paused: boolean) => void,
    private readonly onSpeed: (speedIndex: number) => void,
  ) {
    pauseButton.addEventListener('click', () => {
      pauseButton.blur(); // so that Space does not also "click" the focused button
      this.togglePause();
    });
    window.addEventListener('keydown', (event) => this.onKey(event));
  }

  setSpeeds(speeds: readonly number[]): void {
    this.buttons.forEach((button) => button.remove());
    this.buttons = speeds.map((speed, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `x${speed}`;
      button.title = `Vitesse x${speed} (touche ${index + 1})`;
      button.addEventListener('click', () => {
        button.blur();
        this.onSpeed(index);
      });
      this.speedsElement.appendChild(button);
      return button;
    });
    this.render();
  }

  setStatus(date: string, paused: boolean, speedIndex: number): void {
    this.dateElement.textContent = date;
    this.paused = paused;
    this.speedIndex = speedIndex;
    this.render();
  }

  private togglePause(): void {
    this.onPause(!this.paused);
  }

  private onKey(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.repeat) return;
    if (document.body.classList.contains('page-open')) return;
    if (event.code === 'Space') {
      event.preventDefault();
      this.togglePause();
      return;
    }
    const match = /^(?:Digit|Numpad)(\d)$/.exec(event.code);
    const index = match ? Number(match[1]) - 1 : -1;
    if (index >= 0 && index < this.buttons.length) this.onSpeed(index);
  }

  private render(): void {
    this.pauseButton.classList.toggle('active', this.paused);
    this.pauseButton.textContent = this.paused ? '▶' : '⏸';
    this.pauseButton.title = this.paused ? 'Reprendre (Espace)' : 'Pause (Espace)';
    this.buttons.forEach((button, index) => button.classList.toggle('active', !this.paused && index === this.speedIndex));
  }
}
