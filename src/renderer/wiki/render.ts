/** Draws Wiki blocks and markup texts as HTML (links, live variables, tables, « Dans ta partie » boxes). */
import type { WikiLibrary } from './library';
import { parseInline } from './markup';
import type { Block, WikiAction } from './model';
import { formatVariable } from './values';

export interface RenderHooks {
  openPage: (id: string) => void;
  action: (action: WikiAction) => void;
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

/** A markup text as nodes. */
export function inline(library: WikiLibrary, text: string, hooks: RenderHooks): Node[] {
  return parseInline(text).map((segment): Node => {
    switch (segment.kind) {
      case 'text':
        return document.createTextNode(segment.text);
      case 'bold':
        return node('strong', '', segment.text);
      case 'link': {
        if (!library.has(segment.page)) return node('span', 'wiki-broken', segment.text ?? segment.page);
        const link = node('a', 'wiki-link', segment.text ?? library.title(segment.page));
        link.href = '#';
        link.addEventListener('click', (event) => {
          event.preventDefault();
          hooks.openPage(segment.page);
        });
        return link;
      }
      case 'var': {
        const variable = library.variable(segment.file, segment.key);
        if (!variable) return node('span', 'wiki-broken', `{${segment.file} › ${segment.key} ?}`);
        const changed = variable.value !== variable.defaultValue;
        const value = node('span', `wiki-var${changed ? ' changed' : ''}`, formatVariable(variable, variable.value));
        const parts = [`${variable.label} — ${variable.help}`, library.label('var.where', { fichier: variable.file, cle: variable.key })];
        if (changed) parts.push(library.label('var.changed', { defaut: formatVariable(variable, variable.defaultValue) }));
        if (variable.worldValue !== undefined) parts.push(library.label('var.world', { valeur: formatVariable(variable, variable.worldValue) }));
        value.title = parts.join('\n');
        return value;
      }
    }
  });
}

function actionButton(action: WikiAction, hooks: RenderHooks): HTMLElement {
  const button = node('button', 'wiki-action', action.label);
  button.type = 'button';
  button.addEventListener('click', () => (action.kind === 'page' ? hooks.openPage(action.page) : hooks.action(action)));
  return button;
}

/** One block as HTML. */
export function renderBlock(library: WikiLibrary, block: Block, hooks: RenderHooks): HTMLElement {
  switch (block.kind) {
    case 'heading': {
      const heading = node('h3', 'wiki-h');
      heading.append(...inline(library, block.text, hooks));
      return heading;
    }
    case 'paragraph': {
      const paragraph = node('p', 'wiki-p');
      paragraph.append(...inline(library, block.text, hooks));
      return paragraph;
    }
    case 'note': {
      const note = node('div', 'wiki-note');
      note.append(...inline(library, block.text, hooks));
      return note;
    }
    case 'list': {
      const list = node('ul', 'wiki-list');
      for (const item of block.items) {
        const li = node('li');
        li.append(...inline(library, item, hooks));
        list.append(li);
      }
      return list;
    }
    case 'table': {
      const table = node('table', 'wiki-table');
      const head = node('tr');
      for (const cell of block.head) head.append(node('th', '', cell));
      table.append(head);
      for (const row of block.rows) {
        const tr = node('tr');
        for (const cell of row) {
          const td = node('td');
          td.append(...inline(library, cell, hooks));
          tr.append(td);
        }
        table.append(tr);
      }
      const wrap = node('div', 'wiki-table-wrap');
      wrap.append(table);
      return wrap;
    }
    case 'live': {
      const box = node('div', 'wiki-live');
      box.append(node('div', 'wiki-live-title', library.label('live.boxTitle')));
      for (const inner of library.liveBox(block.id)) box.append(renderBlock(library, inner, hooks));
      return box;
    }
    case 'actions': {
      const bar = node('div', 'wiki-actions');
      for (const action of block.actions) bar.append(actionButton(action, hooks));
      return bar;
    }
  }
}
