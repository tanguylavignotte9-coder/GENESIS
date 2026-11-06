export interface Connaissance {
  id: number;
  nom: string;
  prerequis: number[];
}

export class GrapheSavoir {
  private atomes: Map<number, Connaissance> = new Map();
  private prochainId = 1;

  ajouter(nom: string, prerequis: number[] = []): Connaissance {
    const c: Connaissance = { id: this.prochainId++, nom, prerequis: [...prerequis] };
    this.atomes.set(c.id, c);
    return c;
  }

  get(id: number): Connaissance | undefined {
    return this.atomes.get(id);
  }

  tous(): Connaissance[] {
    return Array.from(this.atomes.values());
  }

  estMaitrisee(id: number, connaissancesIndividus: Set<number>[]): boolean {
    for (const c of connaissancesIndividus) {
      if (c.has(id)) return true;
    }
    return false;
  }

  serialiser(): Connaissance[] {
    return this.tous().map((c) => ({ ...c, prerequis: [...c.prerequis] }));
  }

  restaurer(atomes: Connaissance[]): void {
    this.atomes = new Map(atomes.map((c) => [c.id, { ...c, prerequis: [...c.prerequis] }]));
    this.prochainId = atomes.reduce((m, c) => Math.max(m, c.id + 1), 1);
  }
}
