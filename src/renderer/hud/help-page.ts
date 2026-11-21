import { el, Overlay } from './overlay';

/** Keys of the game (shown in the help page). */
const KEYS: readonly [string, string][] = [
  ['Glisser, ZQSD ou flèches', 'déplacer la carte'],
  ['Molette', 'zoomer'],
  ['Espace', 'pause'],
  ['1 à 5', 'vitesse du temps'],
  ['Clic sur une personne', 'sa fiche (Maj + clic : le bâtiment sous les gens)'],
  ['Clic sur un animal', 'sa fiche, la caméra le suit'],
  ['Clic sur un bâtiment', 'sa fiche'],
  ['G', 'groupes : tribus, clans, familles'],
  ['I', 'idées : cultures, langues, religions, savoirs, échanges'],
  ['T', 'arbre généalogique'],
  ['R', 'carte des relations'],
  ['P', 'vue politique (calques de la carte)'],
  ['F', 'personnages suivis et leurs nouvelles'],
  ['M', 'afficher ou cacher la météo (pluie, neige)'],
  ['H ou F1', 'cette aide'],
  ['F2', 'atelier des variables'],
  ['F3', 'performances'],
  ['F5', 'sauvegardes'],
  ['Échap', 'fermer la fenêtre ouverte'],
];

/** What each panel shows, in a few lines. */
const PANELS: readonly [string, string][] = [
  ['Journal', 'La chronique des événements, du plus récent au plus ancien. Filtrez par tribu, par personne, par type d’événement ou par période, et cherchez un mot. « Cause » mène à l’événement qui a provoqué celui-ci : on remonte ainsi toute une chaîne. Un clic sur un événement centre la carte sur son lieu, un clic sur un nom ouvre la fiche.'],
  ['Fiche personnage', 'Identité, traits, force, besoins, santé, compétences, relations, souvenirs, savoirs, croyances, groupes. « Afficher le cerveau » montre comment la personne décide ; ☆ la suit ; « Arbre » et « Relations » ouvrent sa famille et ses liens.'],
  ['Généalogie (T)', 'Plusieurs générations autour d’une personne : aïeux, frères et sœurs, descendance. Un clic sur un nom recentre l’arbre, un double-clic ouvre la fiche. Les morts sont marqués †, les lignées éteintes signalées, et la liste des fondateurs dit combien de leurs descendants vivent.'],
  ['Relations (R)', 'Un graphe des liens de la personne dont la fiche est ouverte (famille, amour, affection, rivalité), et un graphe des tribus (alliances, guerres, trêves, tributs).'],
  ['Politique (P)', 'Des calques sur la carte : territoires des tribus, cultures, langues, religions, alliances et guerres. Chaque couleur est une tribu ou une idée partagée.'],
  ['Groupes (G)', 'Les tribus, leurs clans et leurs familles : chefs, régime, légitimité, mécontentement, règles, voisins. « Afficher la gouvernance » montre les décisions des chefs et le soutien de chacun. Un exilé seul vit dans un « camp d’exilé », qui n’est pas compté comme une tribu.'],
  ['Idées (I)', 'Cultures et leurs valeurs, langues et leurs sons, religions, savoirs (qui les a découverts, quand, pourquoi), échanges et lieux nommés.'],
  ['Statistiques', 'Population humaine, pyramide des âges, causes de décès ; populations animales ; et, pour le monde ou une tribu, des courbes de population, de réserves, de savoirs et de bêtes domestiques, avec le régime de chaque tribu.'],
  ['Suivis (F)', 'Les personnages marqués comme favoris et les dernières nouvelles de leur vie (des notifications apparaissent en bas de l’écran).'],
  ['Atelier (F2)', 'Toutes les variables du jeu, avec leur légende et leurs bornes, modifiables en direct ; presets et banc d’essai.'],
];

/** Integrated help (H or F1): the keys, and each panel explained in a few lines. */
export class HelpPage {
  private readonly overlay: Overlay;

  constructor(bar: HTMLElement) {
    this.overlay = new Overlay(bar, 'Aide', 'h', 'Touches et panneaux', 'help-window');
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'F1') return;
      event.preventDefault();
      this.overlay.toggle();
    });
    const keys = el('table', 'help-keys');
    for (const [key, what] of KEYS) {
      const row = document.createElement('tr');
      row.append(el('td', 'help-key', key), el('td', '', what));
      keys.append(row);
    }
    const body = this.overlay.body;
    body.append(el('div', 'stats-title', 'Touches'), keys, el('div', 'stats-title', 'Les panneaux'));
    for (const [name, text] of PANELS) {
      const block = el('div', 'help-panel');
      block.append(el('div', 'help-panel-name', name), el('div', 'sheet-text', text));
      body.append(block);
    }
    body.append(el('div', 'muted', 'GENESIS simule chaque individu : rien n’est écrit à l’avance. Le journal garde les causes de chaque événement pour que l’on puisse toujours comprendre pourquoi.'));
  }
}
