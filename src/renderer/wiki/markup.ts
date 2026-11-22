/**
 * The small markup of Wiki texts, parsed without the DOM (testable in Node):
 *
 * - `[[page-id]]` or `[[page-id|texte]]`: a link to another page;
 * - `{var:fichier.json:clé}`: the current value of a variable of the workshop, with its unit;
 * - `**texte**`: bold.
 *
 * And, for the lines of a written page: `## titre`, `- élément de liste`, `> encadré`,
 * `{live:id}` alone on its line (a « Dans ta partie » box).
 */
import type { Block } from './model';

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'link'; page: string; text: string | null }
  | { kind: 'var'; file: string; key: string };

const TOKEN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\{var:([^:}]+):([^}]+)\}|\*\*([^*]+)\*\*/g;

/** Splits a text into plain text, bold, links and variables. */
export function parseInline(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index;
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) });
    if (match[1] !== undefined) out.push({ kind: 'link', page: match[1].trim(), text: match[2]?.trim() ?? null });
    else if (match[3] !== undefined && match[4] !== undefined) out.push({ kind: 'var', file: match[3].trim(), key: match[4].trim() });
    else if (match[5] !== undefined) out.push({ kind: 'bold', text: match[5] });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

const LIVE = /^\{live:([\w-]+)\}$/;

/** The lines of a written page as blocks (consecutive list items make one list). */
export function parseBody(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;
    const live = LIVE.exec(line);
    if (live) blocks.push({ kind: 'live', id: live[1]! });
    else if (line.startsWith('## ')) blocks.push({ kind: 'heading', text: line.slice(3).trim() });
    else if (line.startsWith('> ')) blocks.push({ kind: 'note', text: line.slice(2).trim() });
    else if (line.startsWith('- ')) {
      const previous = blocks[blocks.length - 1];
      if (previous?.kind === 'list') previous.items.push(line.slice(2).trim());
      else blocks.push({ kind: 'list', items: [line.slice(2).trim()] });
    } else blocks.push({ kind: 'paragraph', text: line });
  }
  return blocks;
}

/** Every text of a block (to find its links and variables). */
export function blockTexts(block: Block): string[] {
  switch (block.kind) {
    case 'heading':
    case 'paragraph':
    case 'note':
      return [block.text];
    case 'list':
      return block.items;
    case 'table':
      return [...block.head, ...block.rows.flat()];
    case 'live':
      return [];
    case 'actions':
      return block.actions.map((action) => action.label);
  }
}

/** Plain text of a markup text (for the search): links by their text, variables dropped. */
export function plainText(text: string, titleOf: (page: string) => string): string {
  return parseInline(text)
    .map((segment) => (segment.kind === 'link' ? (segment.text ?? titleOf(segment.page)) : segment.kind === 'var' ? '' : segment.text))
    .join('');
}
