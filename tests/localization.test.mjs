import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import messages from '../src/messages.js';
import {FONTS} from '../src/notation.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const adapterPath = 'gravewright/modules/static/gravewright_modules';
function findHost() {
 if (process.env.GRAVEWRIGHT_ROOT) return resolve(process.env.GRAVEWRIGHT_ROOT);
 for (let parent = packageRoot; ; parent = dirname(parent)) {
  if (existsSync(join(parent, adapterPath, 'i18n.js'))) return parent;
  if (parent === dirname(parent)) return null;
 }
}
const hostRoot = findHost();

test('private language catalogs have complete keys and preserve parameter contracts', () => {
 assert.deepEqual(Object.keys(messages).sort(), ['en', 'es', 'pt-BR']);
 const keys = Object.keys(messages.en).sort();
 assert.ok(keys.length > 0);
 for (const [locale, catalog] of Object.entries(messages)) {
  assert.deepEqual(Object.keys(catalog).sort(), keys, `${locale} key parity`);
  for (const key of keys) {
   assert.equal(typeof catalog[key], 'string');
   assert.ok(catalog[key].trim(), `${locale}: ${key} is not blank`);
   const parameters = value => [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_.]*|\d+)\}/g)].map(match => match[1]).sort();
   assert.deepEqual(parameters(catalog[key]), parameters(messages.en[key]), `${locale}: ${key} parameters`);
  }
 }
});

class ObservedTarget extends EventTarget {
 listeners = new Map();
 addEventListener(type, listener, options) {
  if (!this.listeners.has(type)) this.listeners.set(type, new Set());
  this.listeners.get(type).add(listener);
  super.addEventListener(type, listener, options);
 }
 removeEventListener(type, listener, options) {
  this.listeners.get(type)?.delete(listener);
  super.removeEventListener(type, listener, options);
 }
 count(type) { return this.listeners.get(type)?.size ?? 0; }
}
class TextNode {
 constructor(value, document) { this.textContent = value; this.ownerDocument = document; }
 remove() {
  if (!this.parentNode) return;
  const siblings = this.parentNode.childNodes;
  siblings.splice(siblings.indexOf(this), 1);
  this.parentNode = null;
 }
}
class Element extends ObservedTarget {
 constructor(tag, document) {
  super(); this.localName = tag; this.tagName = tag.toUpperCase(); this.ownerDocument = document;
  this.childNodes = []; this.attributes = new Map(); this.dataset = {}; this.style = {}; this.className = '';
  this.value = ''; this.disabled = false;
  this.classList = {add: (...names) => {this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' ');}};
 }
 append(...nodes) {
  for (const value of nodes) {
   const node = typeof value === 'string' ? this.ownerDocument.createTextNode(value) : value;
   node.remove?.(); node.parentNode = this; this.childNodes.push(node);
  }
 }
 appendChild(node) { this.append(node); return node; }
 add(node) { this.append(node); }
 get children() { return this.childNodes.filter(node => node instanceof Element); }
 get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
 set textContent(value) { for (const child of this.childNodes) child.parentNode = null; this.childNodes = []; this.append(String(value)); }
 setAttribute(key, value) { this.attributes.set(key, String(value)); }
 getAttribute(key) { return this.attributes.get(key) ?? null; }
 get isConnected() { return this === this.ownerDocument.body || Boolean(this.parentNode?.isConnected); }
 remove() { TextNode.prototype.remove.call(this); }
 focus() { this.ownerDocument.activeElement = this; }
}
function descendants(element) {
 return [element, ...element.children.flatMap(descendants)];
}
function find(element, predicate) {
 const result = descendants(element).find(predicate);
 assert.ok(result, 'Expected UI element to exist');
 return result;
}
function byClass(element, name) { return find(element, node => node.className.split(/\s+/).includes(name)); }
function control(element, name) { return find(element, node => node.name === name); }
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };

async function loadModule() {
 const bundled = await build({
  entryPoints: [join(packageRoot, 'src/main.js')], bundle: true, write: false, format: 'esm', platform: 'browser',
  plugins: [{name: 'renderer-fixture', setup(bundler) {
   bundler.onResolve({filter: /^\.\/renderer\.js$/}, () => ({path: 'renderer', namespace: 'fixture'}));
   bundler.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({contents: `
    export class DiceRenderer {
     constructor(){this.width=24;this.height=18;globalThis.__diceLocalizationFixture.renderers.push(this);}
     size(){} set(){} frame(){} clear(){} dispose(){this.disposed=true;}
    }`, loader: 'js'}));
  }}],
 });
 return (await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text + '\n//# sourceURL=dice-localization-fixture.mjs').toString('base64')}`)).default;
}

test('native Translator updates open controls, pending notices and later openings without altering authored content', {
 skip: !hostRoot && 'Set GRAVEWRIGHT_ROOT to a Gravewright checkout to run the native SDK integration.',
}, async t => {
 const {createTranslator} = await import(pathToFileURL(join(hostRoot, adapterPath, 'i18n.js')));
 const {createUiApi} = await import(pathToFileURL(join(hostRoot, adapterPath, 'modal-api.js')));
 const {Lifetime} = await import(pathToFileURL(join(hostRoot, adapterPath, 'lifetime.js')));
 const savedGlobals = new Map();
 const install = (key, value) => {savedGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});};
 const document = new ObservedTarget();
 document.defaultView = {Element}; document.documentElement = {lang: 'pt-BR'};
 document.createElement = tag => new Element(tag, document);
 document.createTextNode = value => new TextNode(value, document);
 document.getElementById = () => null;
 document.body = document.createElement('body'); document.fonts = new Set();
 const window = new ObservedTarget(); window.gravewrightLocale = {id: 'en', messages: {}};
 const state = {renderers: [], workers: [], modalCalls: [], failPreview: false};
 install('document', document); install('window', window); install('__diceLocalizationFixture', state);
 install('FontFace', class {async load() {return this;}});
 install('Option', class extends Element {constructor(text, value) {super('option', document); this.textContent = text; this.value = value;}});
 install('Worker', class {
  constructor() {state.workers.push(this);}
  postMessage(request) {
   queueMicrotask(() => this.onmessage?.({data: state.failPreview ? {id: request.id, error: 'fixture failure'} : {
    id: request.id, result: {landing: request.dice.map(() => 0), frames: [new Array(request.dice.length * 7).fill(0)], impacts: []},
   }}));
  }
  terminate() {this.terminated = true;}
 });
 install('matchMedia', () => ({matches: true}));
 install('cancelAnimationFrame', () => {});
 const life = new Lifetime(error => {throw error;});
 const i18n = createTranslator('gravewright-3d-dice', life);
 let revision = 1, savingError, savedAppearance, savingGate;
 const api = createUiApi(life, {}, {document, mountModal(element, options) {
  state.modalCalls.push(element); document.body.append(element); element.open = true;
  // The host consults canClose for Escape. An explicit module close remains
  // permitted, including after a completed save while its button is disabled.
  state.escape = () => {if (options.canClose()) element.close();};
  element.close = force => {element.forcedClose = force; if (!element.open) return; element.open = false; element.remove(); element.dispatchEvent(new Event('close'));};
 }});
 const events = new Map();
 const ctx = {
  i18n, signal: life.signal, onDispose: life.onDispose,
  styles: {use() {}}, assets: {url: value => `/module/${value}`},
  storage: {user: {
   async get() {return {value: savedAppearance, revision};},
   async set(key, value, options) {if (savingGate) await savingGate; if (savingError) throw savingError; assert.equal(options.expectedRevision, revision); savedAppearance = value; return {value, revision: ++revision};},
  }},
  api: {ui: api, events: {on: (name, listener) => events.set(name, listener)}},
 };
 const module = await loadModule();
 t.after(async () => {
  module.stop(); await life.close();
  for (const [key, descriptor] of savedGlobals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
 });
 const locale = id => {window.gravewrightLocale = {id, messages: {}}; window.dispatchEvent(new Event('gravewright:locale'));};
 const modal = () => byClass(document.body, 'gw3d-customize');
 const title = node => find(node, element => element.localName === 'h2');
 const notice = node => byClass(node, 'gw3d-notice');
 const submit = async node => {
  const form = find(node, element => element.localName === 'form');
  const event = new Event('submit', {cancelable: true});
  if (form.onsubmit) await form.onsubmit(event); else {form.dispatchEvent(event); await flush();}
 };

 await module.start(ctx);
 assert.equal(i18n.has('customize.title'), true);
 assert.equal(createTranslator().has('customize.title'), false, 'Module catalogs do not replace the host namespace');
 assert.equal(window.count('gravewright:locale'), 1, 'One locale subscription belongs to the module lifetime');
 assert.equal(window.count('gravewright:i18n-catalog'), 1);
 await module.customize(); await flush();
 let panel = modal();
 assert.equal(panel.localName, 'section', 'Customization uses the native modal contract');
 assert.equal(title(panel).textContent, messages.en['customize.title'], 'Native locale overrides unrelated document language');
 assert.equal(state.modalCalls.length, 1);
 locale('fr');
 assert.equal(title(panel).textContent, messages.en['customize.title'], 'An unsupported locale falls back to the module English catalog');
 const controls = ['diceColor', 'textColor', 'font'].map(key => control(panel, key));
 const [diceColor, textColor, font] = controls;
 diceColor.value = '#224488'; diceColor.dispatchEvent(new Event('input'));
 textColor.value = '#abcdef'; textColor.dispatchEvent(new Event('input'));
 font.value = 'ibmplexmono'; font.dispatchEvent(new Event('input')); font.focus();
 const legal = find(panel, node => node.className === 'gw3d-credits').childNodes.find(node => node instanceof TextNode).textContent;
 assert.equal(legal, 'Based on Dice So Nice · Simone & JDW · AGPLv3 · No warranty. ');
 const fontNames = Object.values(FONTS);
 assert.deepEqual(font.children.map(option => option.textContent), fontNames);
 for (const id of ['pt-BR', 'es', 'en', 'pt-BR']) {
  locale(id);
  assert.equal(title(panel).textContent, messages[id]['customize.title']);
  assert.equal(byClass(panel, 'gw3d-preview').getAttribute('aria-label'), messages[id]['appearance.preview']);
  assert.equal(control(panel, 'diceColor'), diceColor, 'Locale changes keep the edited DOM control');
  assert.equal(control(panel, 'font'), font);
  assert.equal(document.activeElement, font);
  assert.deepEqual(controls.map(input => input.value), ['#224488', '#abcdef', 'ibmplexmono']);
  assert.deepEqual(font.children.map(option => option.textContent), fontNames, 'Font family names remain verbatim');
  assert.equal(find(panel, node => node.className === 'gw3d-credits').childNodes.find(node => node instanceof TextNode).textContent, legal, 'Legal notice remains verbatim');
  assert.equal(find(panel, node => node.localName === 'a' && node.href.startsWith('https://')).textContent, messages[id]['links.source']);
 }

 savingError = new Error('fixture failure');
 await submit(panel);
 assert.equal(notice(panel).textContent, messages['pt-BR']['status.save_failed']);
 locale('es');
 assert.equal(notice(panel).textContent, messages.es['status.save_failed'], 'An existing error is translated without another failed save');
 savingError = Object.assign(new Error('concurrent change'), {code: 'conflict'});
 await submit(panel);
 assert.equal(notice(panel).textContent, messages.es['status.conflict']);
 locale('pt-BR');
 assert.equal(notice(panel).textContent, messages['pt-BR']['status.conflict']);
 assert.deepEqual(controls.map(input => input.value), ['#224488', '#abcdef', 'ibmplexmono']);
 savingError = null;
 await submit(panel);
 assert.equal(panel.isConnected, false);
 assert.deepEqual(savedAppearance, {diceColor: '#224488', textColor: '#abcdef', font: 'ibmplexmono'});

 state.failPreview = true;
 await module.customize(); await flush(); panel = modal();
 assert.equal(title(panel).textContent, messages['pt-BR']['customize.title']);
 assert.equal(notice(panel).textContent, messages['pt-BR']['status.preview_unavailable']);
 locale('es');
 assert.equal(notice(panel).textContent, messages.es['status.preview_unavailable']);
 assert.equal(control(panel, 'font').value, 'ibmplexmono');
 assert.equal(window.count('gravewright:locale'), 1, 'Reopening does not add subscriptions');
 state.failPreview = false;
 const author = 'Font', label = 'Customize dice';
 events.get('chat.message')({id: 'authored-roll', from: {name: author}, roll: {label, result: {rolls: [{plan: {initial: {sides: 6}}, facts: [{id: 'die', face: 4}]}]}}});
 await flush();
 const caption = byClass(document.body, 'gw3d-caption');
 assert.ok(caption.textContent.includes(author) && caption.textContent.includes(label));
 const authoredCaption = caption.textContent;
 locale('pt-BR'); assert.equal(caption.textContent, authoredCaption);
 const layer = byClass(document.body, 'gw3d-layer');
 assert.ok(layer.translate === false || layer.getAttribute('translate') === 'no', 'Authored roll captions opt out of host text translation');

 let finishSave;
 savingGate = new Promise(resolve => {finishSave = resolve;});
 const pendingSave = submit(panel);
 await flush();
 assert.equal(find(panel, node => node.localName === 'button' && node.type === 'submit').disabled, true);
 state.escape();
 assert.equal(panel.isConnected, true, 'Escape is blocked while a save is in flight');
 module.stop();
 assert.equal(panel.isConnected, false);
 assert.equal(panel.forcedClose, true, 'Disposal closes even a native modal currently busy saving');
 assert.equal(window.count('gravewright:locale'), 0);
 assert.equal(window.count('gravewright:i18n-catalog'), 0);
 assert.equal(i18n.has('customize.title'), false, 'Private catalogs are unregistered on deactivation');
 assert.equal(document.fonts.size, 0);
 assert.ok(state.workers.every(worker => worker.terminated));
 assert.ok(state.renderers.every(renderer => renderer.disposed));
 assert.equal(descendants(document.body).some(node => node.className === 'gw3d-layer'), false);
 finishSave(); await pendingSave;
 module.stop();
});
