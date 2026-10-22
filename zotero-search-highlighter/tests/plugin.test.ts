import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { appendHighlighted, highlightDetached, palettes, parseQuery, segments } from '../src/core';
import { TreeAdapter } from '../src/tree';
import { InfoAdapter } from '../src/info';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('query: phrases, Unicode, case deduplication and operator exclusion', () => {
  assert.deepEqual(parseQuery('organoid OR "cell segmentation" 类器官 Organoid -exclude AND NOT').map(t => t.text), ['organoid', 'cell segmentation', '类器官']);
  assert.deepEqual(parseQuery('“cell segmentation”').map(t => t.text), ['cell segmentation']);
  assert.equal(parseQuery('   ').length, 0);
});
test('literal regex characters are safe; original spelling is retained', () => {
  const result = segments('C++ and [a] C++', parseQuery('C++ [a]'));
  assert.deepEqual(result.filter(s => s.color !== undefined).map(s => s.text), ['C++', '[a]', 'C++']);
  assert.equal(result.map(s => s.text).join(''), 'C++ and [a] C++');
});
test('phrase wins at the same offset; color follows query order', () => {
  assert.deepEqual(segments('Cell segmentation cell', parseQuery('cell "cell segmentation"')), [{text:'Cell segmentation',color:1},{text:' ',},{text:'cell',color:0}]);
});
test('whole words and non-ASCII characters', () => {
  assert.equal(segments('cell cells αcell cell', parseQuery('cell'), true).filter(s => s.color !== undefined).length, 2);
  assert.equal(segments('类器官分割', parseQuery('类器官')).filter(s => s.color !== undefined).length, 1);
  assert.equal(segments('İ CELL', parseQuery('cell')).find(s => s.color !== undefined)?.text, 'CELL');
});
test('bounded token count and hostile HTML remain text', () => {
  assert.equal(parseQuery(Array.from({length: 100}, (_, i) => `word${i}`).join(' ')).length, 32);
  const dom = new JSDOM(); const root = dom.window.document.createElement('div');
  appendHighlighted(root, '<img src=x onerror=alert(1)>', parseQuery('img'), false, palettes[0]);
  assert.equal(root.querySelectorAll('img').length, 0);
  assert.equal(root.textContent, '<img src=x onerror=alert(1)>');
});
test('detached cells keep native icons, rich formatting, text and handlers', () => {
  const dom = new JSDOM('<div class="cell"><span class="cell-icon">cell</span><span class="cell-text"><i>Cell</i> segmentation</span></div>');
  const cell = dom.window.document.querySelector('.cell')!;
  const icon = cell.firstElementChild;
  highlightDetached(cell, parseQuery('cell'), false, palettes[0]);
  assert.equal(cell.firstElementChild, icon);
  assert.equal(cell.querySelector('.cell-icon mark'), null);
  assert.equal(cell.querySelector('i mark')?.textContent, 'Cell');
});
test('tree hooks cover fresh virtual rows and restore inherited renderer', () => {
  const dom = new JSDOM(); let invalidations = 0;
  const proto = { _renderCell(_i: number, data: string) { const el = dom.window.document.createElement('span'); el.textContent = data; return el; } };
  const view = Object.assign(Object.create(proto), {tree:{invalidate:()=>invalidations++}});
  let terms = parseQuery('cell');
  const adapter = new TreeAdapter({ZoteroPane:{itemsView:view}}, () => ({terms,whole:false,palette:palettes[0]}));
  adapter.sync();
  assert.equal(view._renderCell(0, 'Cell A', {dataKey:'title'}).querySelectorAll('mark').length, 1);
  assert.equal(view._renderCell(900, 'Cell B', {dataKey:'firstCreator'}).querySelectorAll('mark').length, 1);
  terms = [];
  assert.equal(view._renderCell(1, 'Cell C', {dataKey:'title'}).querySelectorAll('mark').length, 0);
  adapter.dispose();
  assert.equal(Object.hasOwn(view, '_renderCell'), false);
  assert.equal(view._renderCell, proto._renderCell);
  assert.ok(invalidations >= 2);
});
test('tree replacement unhooks old view and respects a later plugin wrapper', () => {
  const original = () => ({ownerDocument:null});
  const a = {_renderCell:original}, b = {_renderCell:original};
  const win = {ZoteroPane:{itemsView:a}};
  const adapter = new TreeAdapter(win, () => ({terms:[],whole:false,palette:palettes[0]}));
  adapter.sync(); win.ZoteroPane.itemsView = b; adapter.sync();
  assert.equal(a._renderCell, original);
  const laterWrapper = () => null as any;
  b._renderCell = laterWrapper;
  adapter.dispose(); assert.equal(b._renderCell, laterWrapper);
});
function infoFixture() {
  const dom = new JSDOM('<item-box><editable-text fieldname="title" style="position:static"><textarea></textarea></editable-text></item-box>', {pretendToBeVisual:true});
  const win = dom.window as any;
  win.ResizeObserver = class { observe() {} disconnect() {} };
  const host = win.document.querySelector('editable-text') as HTMLElement;
  const input = host.querySelector('textarea')!;
  input.value = 'Cell segmentation';
  input.getBoundingClientRect = host.getBoundingClientRect = () => ({width:300,height:60,left:0,top:0,right:300,bottom:60,x:0,y:0,toJSON(){}});
  let terms = parseQuery('cell');
  const adapter = new InfoAdapter(win, () => ({terms,whole:false,palette:palettes[0]}));
  return {dom,win,host,input,adapter,clear:()=>{terms=[];}};
}
test('Info layer preserves input identity and values; focus removes overlay', () => {
  const {dom,host,input,adapter} = infoFixture();
  adapter.update();
  assert.equal(host.querySelector('mark')?.textContent, 'Cell');
  assert.equal(host.querySelector('textarea'), input);
  assert.equal(input.value, 'Cell segmentation');
  input.focus();
  assert.equal(host.querySelector('.zsh-info-overlay'), null);
  input.value = 'Edited cell'; input.blur(); adapter.update();
  assert.equal(host.querySelector('mark')?.textContent, 'cell');
  assert.equal(input.value, 'Edited cell');
  adapter.dispose();
  assert.equal(host.style.position, 'static');
  assert.equal(host.querySelector('.zsh-info-overlay'), null);
  dom.window.close();
});
test('Info clear query, item switch and detached nodes leave no stale layers', () => {
  const {dom,host,input,adapter,clear} = infoFixture();
  adapter.update(); input.value = 'Unrelated item'; adapter.update();
  assert.equal(host.querySelector('mark'), null);
  input.value = 'Cell'; adapter.update(); clear(); adapter.update();
  assert.equal(host.classList.contains('zsh-info-active'), false);
  host.remove(); adapter.update(); adapter.dispose(); dom.window.close();
});
test('Info observer settles instead of repeatedly reacting to its own changes', async () => {
  const {dom,adapter,host} = infoFixture();
  let count = 0; const update = adapter.update.bind(adapter);
  adapter.update = () => { count++; update(); };
  adapter.update();
  await new Promise(resolve => setTimeout(resolve, 220));
  assert.equal(count, 1);
  assert.equal(host.querySelectorAll('.zsh-info-overlay').length, 1);
  adapter.dispose(); dom.window.close();
});

test('packaged bootstrap: startup, second window, preferences, columns, disable and re-enable', async () => {
  const bundle = buildSync({entryPoints:['src/index.ts'],bundle:true,format:'iife',globalName:'ZSH',write:false,target:'firefox140'}).outputFiles[0].text;
  const makeWindow = () => {
    const dom = new JSDOM('<div id="menu_ToolsPopup"></div><input id="zotero-tb-search" value="cell">', {pretendToBeVisual:true});
    const win = dom.window as any;
    win.ResizeObserver = class { observe() {} disconnect() {} };
    win.document.createXULElement = (name: string) => win.document.createElement(name);
    const original = (_i: number, data: string) => { const el = win.document.createElement('span'); el.textContent = data; return el; };
    win.ZoteroPane = {itemsView:{_renderCell:original,tree:{invalidate(){}}}};
    return {dom,win,original};
  };
  const a = makeWindow(), b = makeWindow();
  const stored = new Map(); let registration: any; let removed = '';
  const errors: any[] = [];
  const Zotero = {
    initializationPromise:Promise.resolve(),getMainWindows:()=>[a.win],
    Prefs:{get:(key:string)=>stored.get(key),set:(key:string,val:unknown)=>stored.set(key,val)},
    ItemTreeManager:{registerColumn:(value:any)=>{registration=value;return 'registered-abstract';},unregisterColumn:(key:string)=>{removed=key;}},
    logError:(error:any)=>errors.push(error),
  };
  const Services = {scriptloader:{loadSubScriptWithOptions:(_uri:string,options:any)=>{
    assert.equal(options.allowUnsafeURL,true);
    assert.equal(options.ignoreCache,true);
    return vm.runInNewContext(bundle,options.target);
  }}};
  const context: any = {Zotero,Services,console};
  vm.createContext(context);
  vm.runInContext(readFileSync('bootstrap.js','utf8'),context);
  await context.startup({rootURI:'jar:file:///plugin.xpi!/'},1);
  assert.deepEqual(errors,[]);
  assert.equal(a.win.document.querySelectorAll('#zsh-tools-menu').length,1);
  assert.equal(a.win.ZoteroPane.itemsView._renderCell(0,'Cell',{dataKey:'title'}).querySelectorAll('mark').length,1);
  assert.equal(registration.renderCell(0,'Cell',{},false,a.win.document).querySelectorAll('mark').length,1);
  context.onMainWindowLoad({window:b.win});
  assert.equal(b.win.document.querySelectorAll('#zsh-tools-menu').length,1);
  const enabled = a.win.document.querySelector('menuitem');
  enabled.dispatchEvent(new a.win.Event('command',{bubbles:true}));
  assert.equal(b.win.ZoteroPane.itemsView._renderCell(0,'Cell',{dataKey:'title'}).querySelectorAll('mark').length,0);
  enabled.dispatchEvent(new a.win.Event('command',{bubbles:true}));
  assert.equal(b.win.ZoteroPane.itemsView._renderCell(0,'Cell',{dataKey:'title'}).querySelectorAll('mark').length,1);
  context.onMainWindowUnload({window:b.win});
  assert.equal(b.win.ZoteroPane.itemsView._renderCell,b.original);
  context.shutdown({},4);
  assert.equal(a.win.ZoteroPane.itemsView._renderCell,a.original);
  assert.equal(a.win.document.querySelector('#zsh-tools-menu'),null);
  assert.equal(a.win.document.querySelector('style'),null);
  assert.equal(removed,'registered-abstract');
  await context.startup({rootURI:'jar:file:///plugin.xpi!/'},3);
  assert.equal(a.win.document.querySelectorAll('#zsh-tools-menu').length,1);
  context.shutdown({},4); a.dom.window.close(); b.dom.window.close();
});

test('installed Zotero 10.0.6 manifest gate rejects old package and accepts release manifest', () => {
  const fixture = JSON.parse(readFileSync('tests/fixtures/zotero-10.0.6-loader.json','utf8'));
  const manifest = JSON.parse(readFileSync('manifest.json','utf8'));
  const validate = (candidate:any) => {
    const errors:string[] = [];
    vm.runInNewContext(`(function(manifest) { ${fixture.requiredFieldsGuard} }).call(host, manifest)`, {
      host: {type:'extension',manifestError:(message:string)=>errors.push(message)},manifest:candidate,
    });
    return errors;
  };
  const old = structuredClone(manifest); delete old.applications.zotero.update_url;
  assert.deepEqual(validate(old), ['applications.zotero.update_url not provided']);
  assert.deepEqual(validate(manifest), []);
  const updates = new URL(manifest.applications.zotero.update_url);
  assert.equal(updates.protocol, 'https:');
  assert.equal(fixture.hasServicesModule, false);
  assert.ok(!readFileSync('bootstrap.js','utf8').includes('Services.sys.mjs'));
});

test('update security rejects the 0.1.1 data URL and accepts the HTTPS release URL', () => {
  // XPIDatabase.sys.mjs providesUpdatesSecurely, Zotero 10.0.6.
  const secure = (url:string) => !url || url.startsWith('https:');
  assert.equal(secure('data:application/json,%7B%22addons%22%3A%7B%7D%7D'),false);
  const manifest = JSON.parse(readFileSync('manifest.json','utf8'));
  assert.equal(secure(manifest.applications.zotero.update_url),true);
});
