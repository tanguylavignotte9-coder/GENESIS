export class Langue {
  id: number;
  nom: string;
  parentId: number | null;
  divergence: number;

  constructor(id: number, nom: string, parentId: number | null) {
    this.id = id;
    this.nom = nom;
    this.parentId = parentId;
    this.divergence = 0;
  }

  serialiser(): Record<string, unknown> {
    return { ...this } as unknown as Record<string, unknown>;
  }

  static restaurer(d: Record<string, unknown>): Langue {
    const l = new Langue(d.id as number, d.nom as string, d.parentId as number | null);
    l.divergence = d.divergence as number;
    return l;
  }
}
