import { appendHighlighted, segments, type Term } from './core';
type Entry = { host: HTMLElement; input: HTMLInputElement | HTMLTextAreaElement; overlay: HTMLElement; position: string };
export class InfoAdapter {
  private entries = new Map<HTMLElement, Entry>();
  private observer: MutationObserver;
  private resize: ResizeObserver;
  private pending = 0;
  private dead = false;
  private onFocus = (e: Event) => {
    const host = (e.target as Element)?.closest?.('editable-text') as HTMLElement;
    if (host) this.remove(host);
  };
  private onBlur = () => this.schedule();
  constructor(private win: any, private config: () => { terms: Term[]; whole: boolean; palette: string[] }) {
    this.observer = new win.MutationObserver(() => this.schedule());
    this.resize = new win.ResizeObserver(() => this.schedule());
    this.resize.observe(win.document.documentElement);
    this.observe();
    win.document.addEventListener('focusin', this.onFocus, true);
    win.document.addEventListener('focusout', this.onBlur, true);
    win.addEventListener('resize', this.onBlur);
  }
  private observe() {
    this.observer.observe(this.win.document.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['value', 'fieldname', 'hidden', 'collapsed', 'multiline', 'nowrap'],
    });
  }
  schedule() {
    if (!this.pending && !this.dead) this.pending = this.win.setTimeout(() => {
      this.pending = 0;
      this.update();
    }, 60);
  }
  update() {
    if (this.dead) return;
    this.observer.disconnect();
    try {
      for (const host of [...this.entries.keys()]) this.remove(host);
      const c = this.config();
      if (!c.terms.length) return;
      const doc = this.win.document;
      const fields = doc.querySelectorAll('item-box editable-text, info-box editable-text, item-pane-header editable-text, abstract-box editable-text, #zotero-item-pane editable-text');
      for (const host of fields as NodeListOf<HTMLElement>) {
        const name = host.getAttribute('fieldname') || '';
        const isAbstract = !!host.closest('abstract-box');
        const isHeader = !!host.closest('item-pane-header');
        if (!isAbstract && !isHeader && !/^(title|shortTitle|abstractNote|creator-)/.test(name)) continue;
        const input = host.querySelector('input, textarea') as Entry['input'];
        if (!input || host.contains(doc.activeElement) || !segments(input.value, c.terms, c.whole).some(x => x.color !== undefined)) continue;
        const rect = input.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const hostRect = host.getBoundingClientRect();
        const style = this.win.getComputedStyle(input);
        const overlay = doc.createElementNS('http://www.w3.org/1999/xhtml', 'span') as HTMLElement;
        overlay.className = 'zsh-info-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        for (const key of ['font', 'line-height', 'letter-spacing', 'text-align', 'direction', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'text-indent', 'word-spacing']) {
          overlay.style.setProperty(key, style.getPropertyValue(key));
        }
        Object.assign(overlay.style, {
          left: `${rect.left - hostRect.left - host.clientLeft}px`, top: `${rect.top - hostRect.top - host.clientTop}px`,
          width: `${rect.width}px`, height: `${rect.height}px`, color: style.color,
          whiteSpace: input.localName === 'input' ? 'pre' : 'pre-wrap',
          overflowWrap: style.overflowWrap, wordBreak: style.wordBreak,
        });
        appendHighlighted(overlay, input.value, c.terms, c.whole, c.palette);
        const position = host.style.position;
        if (this.win.getComputedStyle(host).position === 'static') host.style.position = 'relative';
        host.appendChild(overlay);
        overlay.scrollTop = input.scrollTop;
        overlay.scrollLeft = input.scrollLeft;
        host.classList.add('zsh-info-active');
        this.entries.set(host, { host, input, overlay, position });
      }
    }
    finally { this.observe(); }
  }
  private remove(host: HTMLElement) {
    const entry = this.entries.get(host);
    if (!entry) return;
    host.classList.remove('zsh-info-active');
    host.style.position = entry.position;
    entry.overlay.remove();
    this.entries.delete(host);
  }
  dispose() {
    this.dead = true;
    this.win.clearTimeout(this.pending);
    this.observer.disconnect();
    this.resize.disconnect();
    this.win.document.removeEventListener('focusin', this.onFocus, true);
    this.win.document.removeEventListener('focusout', this.onBlur, true);
    this.win.removeEventListener('resize', this.onBlur);
    for (const host of [...this.entries.keys()]) this.remove(host);
  }
}
