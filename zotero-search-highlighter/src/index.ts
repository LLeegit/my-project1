import { appendHighlighted, palettes, parseQuery, type Term } from './core';
import { TreeAdapter } from './tree';
import { InfoAdapter } from './info';
declare const Zotero: any;
const ID = 'search-highlighter@local.zotero';
const PREFIX = 'extensions.zsh.';
const states = new Map<any, WindowState>();
let active = false;
let column: string | undefined;
const prefs: Record<string, boolean | number> = { enabled: true, wholeWord: false, palette: 0 };
function readPrefs() {
  for (const key of Object.keys(prefs)) {
    const value = Zotero.Prefs.get(PREFIX + key, true);
    if (typeof value === typeof prefs[key]) prefs[key] = value;
  }
}
function setPref(key: string, value: boolean | number) {
  Zotero.Prefs.set(PREFIX + key, value, true);
  readPrefs();
  for (const state of states.values()) state.update(true);
}
const css = `
.zsh-match { padding:0; margin:0; border-radius:2px; font:inherit; text-decoration:inherit; }
.zsh-info-overlay { position:absolute; pointer-events:none; box-sizing:border-box; overflow:hidden; border-style:solid; border-color:transparent; z-index:1; }
editable-text.zsh-info-active > input, editable-text.zsh-info-active > textarea { color:transparent !important; -webkit-text-fill-color:transparent !important; }
editable-text.zsh-info-active:focus-within > input, editable-text.zsh-info-active:focus-within > textarea { color:inherit !important; -webkit-text-fill-color:currentColor !important; }
editable-text:focus-within > .zsh-info-overlay { display:none !important; }
`;
class WindowState {
  terms: Term[] = [];
  query = '\u0000';
  tree: TreeAdapter;
  info: InfoAdapter;
  timer: any;
  style: Element;
  menu?: Element;
  dead = false;
  listener = () => this.update();
  config = () => ({ terms: active && !this.dead && prefs.enabled ? this.terms : [], whole: !!prefs.wholeWord, palette: palettes[Number(prefs.palette) % palettes.length] || palettes[0] });
  constructor(public win: any) {
    const doc = win.document;
    this.style = doc.createElementNS('http://www.w3.org/1999/xhtml', 'style');
    this.style.textContent = css;
    doc.documentElement.appendChild(this.style);
    this.tree = new TreeAdapter(win, this.config);
    this.info = new InfoAdapter(win, this.config);
    doc.addEventListener('input', this.listener, true);
    doc.addEventListener('command', this.listener, true);
    this.addMenu();
    this.timer = win.setInterval(() => { this.tree.sync(); this.update(); }, 500);
    this.update(true);
  }
  update(force = false) {
    if (this.dead) return;
    const query = String(this.win.document.getElementById('zotero-tb-search')?.value || '');
    if (!force && query === this.query) return;
    this.query = query;
    this.terms = parseQuery(query);
    this.tree.sync();
    this.tree.refresh();
    this.info.schedule();
  }
  addMenu() {
    const doc = this.win.document;
    const popup = doc.getElementById('menu_ToolsPopup');
    if (!popup || !doc.createXULElement) return;
    const menu = doc.createXULElement('menu');
    menu.id = 'zsh-tools-menu';
    menu.setAttribute('label', '搜索高亮 / Search Highlighter');
    const children = doc.createXULElement('menupopup');
    const options: [string, string, () => void][] = [
      ['enabled', '启用搜索高亮', () => setPref('enabled', !prefs.enabled)],
      ['wholeWord', '完整词匹配（默认：子串）', () => setPref('wholeWord', !prefs.wholeWord)],
      ['palette', '使用第二套配色', () => setPref('palette', prefs.palette ? 0 : 1)],
    ];
    for (const [key, label, action] of options) {
      const item = doc.createXULElement('menuitem');
      item.setAttribute('type', 'checkbox'); item.setAttribute('label', label);
      item.addEventListener('command', action);
      children.addEventListener('popupshowing', () => item.setAttribute('checked', String(!!prefs[key])));
      children.appendChild(item);
    }
    menu.appendChild(children); popup.appendChild(menu); this.menu = menu;
  }
  dispose() {
    this.dead = true; this.terms = [];
    this.win.clearInterval(this.timer);
    this.win.document.removeEventListener('input', this.listener, true);
    this.win.document.removeEventListener('command', this.listener, true);
    this.info.dispose(); this.tree.dispose(); this.style.remove(); this.menu?.remove();
  }
}
export async function startup() {
  await Zotero.initializationPromise;
  active = true; readPrefs();
  // Official API owns column lifetime and data; no item field is ever written.
  column = Zotero.ItemTreeManager.registerColumn({
    dataKey: 'zshAbstract', label: '摘要（搜索高亮）', pluginID: ID,
    enabledTreeIDs: ['main'], width: '300', hidden: true,
    dataProvider: (item: any) => item.isRegularItem() ? item.getField('abstractNote') : '',
    renderCell: (_index: number, data: string, col: any, _first: boolean, doc: Document) => {
      const cell = doc.createElementNS('http://www.w3.org/1999/xhtml', 'span');
      cell.className = `cell ${col.className || ''}`;
      const state = states.get(doc.defaultView);
      const c = state?.config();
      appendHighlighted(cell, String(data || ''), c?.terms || [], c?.whole || false, c?.palette || palettes[0]);
      return cell;
    },
  });
  for (const win of Zotero.getMainWindows()) attach(win);
}
export function attach(win: any) {
  if (!active || states.has(win)) return;
  try {
    const state = new WindowState(win);
    states.set(win, state);
    state.update(true);
  }
  catch (error) { Zotero.logError(error); }
}
export function detach(win: any) { states.get(win)?.dispose(); states.delete(win); }
export function shutdown() {
  active = false;
  for (const win of [...states.keys()]) detach(win);
  if (column) Zotero.ItemTreeManager.unregisterColumn(column);
  column = undefined;
}
