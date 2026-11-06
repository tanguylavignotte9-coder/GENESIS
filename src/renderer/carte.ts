import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';

export class Carte {
  app: Application;
  monde: Container;
  sprite: Sprite;
  coucheAnimaux: Graphics;
  coucheHumains: Graphics;
  coucheVehicules: Graphics;
  coucheTerritoires: Graphics;
  seuilZoomFrontieres = 5;
  canvas: HTMLCanvasElement;
  ctx2d: CanvasRenderingContext2D;
  texture: Texture;
  zoomMin = 0.5;
  zoomMax = 64;

  private constructor(app: Application, canvas: HTMLCanvasElement) {
    this.app = app;
    this.canvas = canvas;
    this.ctx2d = canvas.getContext('2d', { willReadFrequently: false })!;
    this.monde = new Container();
    this.texture = Texture.from(canvas);
    this.sprite = new Sprite(this.texture);
    this.sprite.texture = this.texture;
    this.coucheAnimaux = new Graphics();
    this.coucheHumains = new Graphics();
    this.coucheVehicules = new Graphics();
    this.coucheTerritoires = new Graphics();
    this.monde.addChild(this.coucheTerritoires);
    this.monde.addChild(this.sprite);
    this.monde.addChild(this.coucheAnimaux);
    this.monde.addChild(this.coucheVehicules);
    this.monde.addChild(this.coucheHumains);
    app.stage.addChild(this.monde);
    this.centrer();
  }

  static async creer(hote: HTMLElement, tailleMonde: number): Promise<Carte> {
    const app = new Application();
    await app.init({ resizeTo: window, background: 0x0b0e13, antialias: false, preference: 'webgl' });
    hote.appendChild(app.canvas as HTMLCanvasElement);
    const canvas = document.createElement('canvas');
    canvas.width = tailleMonde;
    canvas.height = tailleMonde;
    const carte = new Carte(app, canvas);
    carte.redimensionner(tailleMonde);
    return carte;
  }

  redimensionner(tailleMonde: number): void {
    this.canvas.width = tailleMonde;
    this.canvas.height = tailleMonde;
    this.sprite.width = tailleMonde;
    this.sprite.height = tailleMonde;
    this.centrer();
  }

  centrer(): void {
    const echelle = Math.min(this.app.screen.width / this.canvas.width, this.app.screen.height / this.canvas.height) * 0.95;
    this.monde.scale.set(echelle);
    this.monde.position.set(
      (this.app.screen.width - this.canvas.width * echelle) / 2,
      (this.app.screen.height - this.canvas.height * echelle) / 2 + 22,
    );
  }

  appliquerDigest(couleurs: Uint32Array): void {
    const image = this.ctx2d.createImageData(this.canvas.width, this.canvas.height);
    image.data.set(new Uint8Array(couleurs.buffer, couleurs.byteOffset, couleurs.byteLength));
    this.ctx2d.putImageData(image, 0, 0);
    this.texture.source.update();
    this.coucheTerritoires.visible = this.monde.scale.x < this.seuilZoomFrontieres;
  }

  appliquerTerritoires(territoires: Array<{ id: number; couleur: number; tuiles: number[] }>): void {
    this.coucheTerritoires.clear();
    for (const t of territoires) {
      for (let i = 0; i + 1 < t.tuiles.length; i += 2) {
        this.coucheTerritoires.rect(t.tuiles[i], t.tuiles[i + 1], 1, 1).fill({ color: t.couleur, alpha: 0.22 });
      }
    }
    this.coucheTerritoires.visible = this.monde.scale.x < this.seuilZoomFrontieres;
  }

  appliquerAnimaux(donnees: number[]): void {
    this.coucheAnimaux.clear();
    for (let i = 0; i + 2 < donnees.length; i += 3) {
      const x = donnees[i] / 10;
      const y = donnees[i + 1] / 10;
      const couleur = donnees[i + 2];
      this.coucheAnimaux.circle(x, y, 1.4).fill({ color: couleur, alpha: 0.95 });
    }
  }

  appliquerVehicules(donnees: number[]): void {
    this.coucheVehicules.clear();
    for (let i = 0; i + 2 < donnees.length; i += 3) {
      this.coucheVehicules.rect(donnees[i] / 10 - 1.5, donnees[i + 1] / 10 - 1.5, 3, 3).fill({ color: donnees[i + 2], alpha: 0.95 });
    }
  }

  appliquerIndividus(donnees: number[]): void {
    this.coucheHumains.clear();
    for (let i = 0; i + 2 < donnees.length; i += 3) {
      const x = donnees[i + 1] / 10;
      const y = donnees[i + 2] / 10;
      this.coucheHumains.circle(x, y, 1.8).fill({ color: 0xffffff, alpha: 0.95 });
    }
  }

  ecranVersMonde(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.monde.x) / this.monde.scale.x,
      y: (sy - this.monde.y) / this.monde.scale.y,
    };
  }

  zoomAutour(pointeurX: number, pointeurY: number, facteur: number): void {
    const ancien = this.monde.scale.x;
    const nouveau = Math.max(this.zoomMin, Math.min(this.zoomMax, ancien * facteur));
    if (nouveau === ancien) return;
    const mondeX = (pointeurX - this.monde.x) / ancien;
    const mondeY = (pointeurY - this.monde.y) / ancien;
    this.monde.scale.set(nouveau);
    this.monde.x = pointeurX - mondeX * nouveau;
    this.monde.y = pointeurY - mondeY * nouveau;
    this.coucheTerritoires.visible = nouveau < this.seuilZoomFrontieres;
  }

  deplacer(dx: number, dy: number): void {
    this.monde.x += dx;
    this.monde.y += dy;
  }
}
