import { highlightDetached, type Term } from './core';
export class TreeAdapter {
  private view: any;
  private original: any;
  private wrapper: any;
  private own = false;
  constructor(private win: any, private config: () => { terms: Term[]; whole: boolean; palette: string[] }) {}
  sync() {
    const view = this.win.ZoteroPane?.itemsView;
    if (view === this.view) return;
    this.dispose();
    if (!view || typeof view._renderCell !== 'function') return;
    this.view = view;
    this.own = Object.hasOwn(view, '_renderCell');
    this.original = view._renderCell;
    const original = this.original, config = this.config;
    this.wrapper = function(this: any, ...args: any[]) {
      const cell = original.apply(this, args);
      if (['title', 'firstCreator', 'abstractNote'].includes(args[2]?.dataKey)) {
        const c = config();
        highlightDetached(cell, c.terms, c.whole, c.palette);
      }
      return cell;
    };
    view._renderCell = this.wrapper;
    this.refresh();
  }
  refresh() { this.view?.tree?.invalidate(); }
  dispose() {
    if (this.view && this.view._renderCell === this.wrapper) {
      if (this.own) this.view._renderCell = this.original;
      else delete this.view._renderCell;
      this.refresh();
    }
    // If another plugin wraps us, its chain can retain our wrapper. Empty terms at shutdown
    // make that retained wrapper inert without breaking the other plugin's chain.
    this.view = this.original = this.wrapper = undefined;
  }
}
