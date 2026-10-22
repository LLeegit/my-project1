export type Term = { text: string; color: number };
export type Segment = { text: string; color?: number };
export const palettes = [
  ['#ffe082', '#a5d6a7', '#90caf9', '#f8bbd0', '#ce93d8', '#80deea'],
  ['#ffd166', '#06d6a0', '#7fc8f8', '#ff9aa2', '#cdb4db', '#b9fbc0'],
];

// Quick-search terms only. Boolean operators are skipped; this does not alter Zotero search.
export function parseQuery(query: string): Term[] {
  const tokens = query.slice(0, 4096).match(/"[^"\n]*"|“[^”\n]*”|[^\s]+/gu) || [];
  const seen = new Set<string>();
  return tokens.flatMap(token => {
    if (/^(AND|OR|NOT)$/i.test(token) || token.startsWith('-')) return [];
    const text = token.replace(/^["“]|["”]$/gu, '').trim();
    if (!text || seen.has(text.toLocaleLowerCase())) return [];
    seen.add(text.toLocaleLowerCase());
    return [{ text, color: seen.size - 1 }];
  }).slice(0, 32);
}

export function segments(text: string, terms: Term[], wholeWord = false): Segment[] {
  if (!terms.length || !text) return [{ text }];
  const alternatives = [...terms].sort((a, b) => b.text.length - a.text.length);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(alternatives.map(t => `(${escape(t.text)})`).join('|'), 'giu');
  const isWord = (s: string) => /[\p{L}\p{N}_]/u.test(s);
  const out: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index!, end = start + match[0].length;
    if (wholeWord && (isWord([...text.slice(0, start)].at(-1) || '') || isWord([...text.slice(end)][0] || ''))) continue;
    if (start > last) out.push({ text: text.slice(last, start) });
    const index = match.slice(1).findIndex(x => x !== undefined);
    out.push({ text: match[0], color: alternatives[index].color });
    last = end;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function appendHighlighted(parent: Node, text: string, terms: Term[], wholeWord: boolean, palette: string[]) {
  const doc = parent.ownerDocument!;
  for (const part of segments(text, terms, wholeWord)) {
    if (part.color === undefined) parent.appendChild(doc.createTextNode(part.text));
    else {
      const mark = doc.createElementNS('http://www.w3.org/1999/xhtml', 'mark');
      mark.className = 'zsh-match';
      mark.style.backgroundColor = palette[part.color % palette.length];
      mark.style.color = '#141414';
      mark.textContent = part.text;
      parent.appendChild(mark);
    }
  }
}

// Operates only on detached renderer output, never on React's live node tree.
export function highlightDetached(cell: Element, terms: Term[], wholeWord: boolean, palette: string[]) {
  const doc = cell.ownerDocument;
  const walker = doc.createTreeWalker(cell, 4);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.parentElement?.closest('.cell-icon, .icon, svg, script, style, mark')) nodes.push(node);
  }
  for (const node of nodes) {
    if (!segments(node.data, terms, wholeWord).some(x => x.color !== undefined)) continue;
    const fragment = doc.createDocumentFragment();
    appendHighlighted(fragment, node.data, terms, wholeWord, palette);
    node.replaceWith(fragment);
  }
}
