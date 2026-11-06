export class Rng {
  private etatInterne: number;

  constructor(graine: number) {
    this.etatInterne = graine >>> 0;
    if (this.etatInterne === 0) {
      this.etatInterne = 0x9e3779b9;
    }
  }

  suivant(): number {
    let t = (this.etatInterne = (this.etatInterne + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  reel(min: number = 0, max: number = 1): number {
    return min + this.suivant() * (max - min);
  }

  entier(min: number, max: number): number {
    return min + Math.floor(this.suivant() * (max - min + 1));
  }

  chance(probabilite: number): boolean {
    return this.suivant() < probabilite;
  }

  choix<T>(elements: readonly T[]): T {
    return elements[this.entier(0, elements.length - 1)];
  }

  melanger<T>(elements: T[]): T[] {
    for (let i = elements.length - 1; i > 0; i--) {
      const j = this.entier(0, i);
      const tmp = elements[i];
      elements[i] = elements[j];
      elements[j] = tmp;
    }
    return elements;
  }

  get etat(): number {
    return this.etatInterne;
  }

  restaurer(etat: number): void {
    this.etatInterne = etat >>> 0;
  }
}
