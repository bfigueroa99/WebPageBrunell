#!/usr/bin/env node
/* Prueba de humo: sirve el sitio en 127.0.0.1, lo abre en un Chromium sin ventana y recorre
   lo que un visitante toca (intro, pestañas, preguntas, cambio de idioma, contadores, menú
   del celular), en escritorio y en celular, con y sin «reducir movimiento».

     node tools/smoke.mjs [--raiz <dir>]

   Falla (salida 1) ante una excepción o un error de consola, una petición a cualquier host
   que no sea el propio (las fuentes de Google se sirven vacías), un paso que no llega a su
   estado o una página más ancha que la pantalla del celular. Salida 2 si no hay Playwright
   o Chromium: dice qué falta y qué rutas probó.

   Chromium: PLAYWRIGHT_CHROMIUM_PATH, si no el conocido de /opt/pw-browsers, si no el de
   Playwright (`npm i -g playwright && npx playwright install chromium`). */
import http from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] != null ? args[i + 1] : null; };
const raiz = resolve(opt('--raiz') || join(dirname(fileURLToPath(import.meta.url)), '..'));
const CHROMIUM_CONOCIDO = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const t0 = Date.now();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Servidor estático mínimo sobre la raíz del sitio. */
function serve() {
  const server = http.createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    let file = join(raiz, path || 'index.html');
    if (!file.startsWith(raiz + sep) && file !== raiz) return res.writeHead(403).end();
    if (file.endsWith(sep) || file === raiz) file = join(file, 'index.html');
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function loadPlaywright() {
  const probadas = [];
  try {
    probadas.push('import("playwright") desde el proyecto');
    return await import('playwright');
  } catch { /* no está en el proyecto: se busca la instalación global */ }
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    probadas.push(join(globalRoot, 'playwright'));
    return createRequire(join(globalRoot, 'noop.js'))('playwright');
  } catch {
    console.error(`Falta Playwright (probé: ${probadas.join(', ')}). Instalar: npm i -g playwright && npx playwright install chromium`);
    process.exit(2);
  }
}

function elegirChromium() {
  const probadas = [];
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
    probadas.push(`PLAYWRIGHT_CHROMIUM_PATH=${process.env.PLAYWRIGHT_CHROMIUM_PATH}`);
    if (existsSync(process.env.PLAYWRIGHT_CHROMIUM_PATH)) return { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, probadas };
    console.error(`Falta Chromium: no existe ${process.env.PLAYWRIGHT_CHROMIUM_PATH} (probé: ${probadas.join(', ')})`);
    process.exit(2);
  }
  probadas.push(CHROMIUM_CONOCIDO);
  if (existsSync(CHROMIUM_CONOCIDO)) return { executablePath: CHROMIUM_CONOCIDO, probadas };
  probadas.push('el Chromium de Playwright');
  return { executablePath: undefined, probadas };
}

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await loadPlaywright();
const { executablePath, probadas } = elegirChromium();
let browser;
try {
  browser = await chromium.launch({ executablePath });
} catch (e) {
  console.error(`Falta Chromium: ${e.message.split('\n')[0]} (probé: ${probadas.join(', ')})`);
  server.close();
  process.exit(2);
}

let fallos = 0;
const fail = (msg) => { fallos++; console.log(`  ✗ ${msg}`); };

/** Pestaña que anota todo error y corta cualquier salida a internet. */
async function abrir(contextOptions = {}) {
  const context = await browser.newContext({ reducedMotion: 'no-preference', ...contextOptions });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`excepción: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && page.errors.push(`consola: ${m.text()}`));
  await page.route('**/*', (r) => {
    const url = r.request().url();
    let host = '';
    try { host = new URL(url).hostname; } catch { /* sin host */ }
    if (host === '127.0.0.1') return r.continue();
    if (host === 'fonts.googleapis.com') return r.fulfill({ contentType: 'text/css', body: '' });
    if (host === 'fonts.gstatic.com') return r.abort();
    page.errors.push(`la página pidió ${url}`);
    return r.abort();
  });
  return page;
}

async function step(page, name, fn) {
  const before = page.errors.length;
  const errs = [];
  try {
    await fn();
  } catch (e) {
    errs.push(e.message.split('\n')[0]);
  }
  errs.unshift(...page.errors.slice(before));
  if (errs.length) fail(`${name}: ${errs.join(' | ')}`);
  else console.log(`  ✓ ${name}`);
}

const esperaIntro = async (page) => {
  await page.waitForFunction(() => document.documentElement.classList.contains('intro-done'), null, { timeout: 6000 });
  await page.waitForSelector('.intro', { state: 'detached', timeout: 3000 });
};
// En la emulación de celular, innerWidth crece con el contenido; clientWidth es el ancho real de la pantalla.
const desborde = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const contadoresListos = (page, sel = '[data-count]') => page.waitForFunction(
  (s) => Array.from(document.querySelectorAll(s)).every((el) => el.textContent === el.dataset.count + (el.dataset.suffix || '')),
  sel, { timeout: 5000 });
const centrar = (page, sel) => page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);

const escritorio = { viewport: { width: 1280, height: 800 } };
const celular = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

console.log('Escritorio 1280×800, ?lang=es');
{
  const page = await abrir(escritorio);
  await step(page, 'escritorio es: carga sin errores', async () => {
    await page.goto(`${base}/?lang=es`);
    await page.waitForLoadState('load');
  });
  await step(page, 'escritorio es: la intro termina y se retira', () => esperaIntro(page));
  await step(page, 'escritorio es: título e idioma', async () => {
    const title = await page.title();
    if (!title.includes('Cámaras')) throw new Error(`el título es «${title}»`);
    if (await page.locator('.lang [data-lang="es"][aria-pressed="true"]').count() !== 1) throw new Error('ES no está marcado como idioma activo');
  });
  await step(page, 'escritorio es: toda ancla interna tiene destino', async () => {
    const rotas = await page.evaluate(() => Array.from(document.querySelectorAll('a[href^="#"]'))
      .map((a) => a.getAttribute('href')).filter((h) => h !== '#' && !document.getElementById(h.slice(1))));
    if (rotas.length) throw new Error(`sin destino: ${rotas.join(', ')}`);
  });
  await step(page, 'escritorio es: pestañas de incidentes (clic y flechas)', async () => {
    const tabs = page.locator('.itab');
    const n = await tabs.count();
    if (n < 2) throw new Error(`hay ${n} pestañas .itab`);
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click();
      if ((await tabs.nth(i).getAttribute('aria-selected')) !== 'true') throw new Error(`la pestaña ${i + 1} no quedó seleccionada`);
    }
    await page.keyboard.press('ArrowRight');
    if ((await tabs.nth(0).getAttribute('aria-selected')) !== 'true') throw new Error('ArrowRight desde la última no vuelve a la primera');
  });
  await step(page, 'escritorio es: pestañas del panel muestran su vista', async () => {
    const tabs = page.locator('.dtab');
    const n = await tabs.count();
    if (n < 2) throw new Error(`hay ${n} pestañas .dtab`);
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click();
      if ((await tabs.nth(i).getAttribute('aria-selected')) !== 'true') throw new Error(`la pestaña ${i + 1} no quedó seleccionada`);
      const id = await tabs.nth(i).getAttribute('aria-controls');
      if (!(await page.locator(`#${id}.dview.is-active`).isVisible())) throw new Error(`#${id} no está activa y visible`);
    }
  });
  await step(page, 'escritorio es: Enter abre cada pregunta', async () => {
    const resumenes = page.locator('#preguntas summary');
    const n = await resumenes.count();
    if (!n) throw new Error('no hay <summary> en #preguntas');
    for (let i = 0; i < n; i++) {
      await resumenes.nth(i).focus();
      await page.keyboard.press('Enter');
      if (!(await resumenes.nth(i).evaluate((s) => s.closest('details').open))) throw new Error(`la pregunta ${i + 1} no se abrió`);
    }
  });
  await step(page, 'escritorio es: arriba la cabecera vuelve a verse', async () => {
    // La cabecera se esconde al bajar: sin esto el clic en el idioma cae fuera de la pantalla.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => !document.querySelector('.header').classList.contains('is-hidden'), null, { timeout: 5000 });
  });
  await step(page, 'escritorio es: cambio a inglés', async () => {
    await page.locator('.lang [data-lang="en"]').click();
    await page.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 5000 });
    const r = await page.evaluate(() => ({
      title: document.title,
      esperado: window.BrunellI18n.en['meta.title'],
      url: location.href,
      guardado: (() => { try { return localStorage.getItem('bn-lang'); } catch { return null; } })(),
      href: document.querySelector('[data-i18n-subject]')?.getAttribute('href') || '',
    }));
    if (r.title !== r.esperado) throw new Error(`el título es «${r.title}», no «${r.esperado}»`);
    if (!r.url.includes('lang=en')) throw new Error(`la URL no lleva lang=en: ${r.url}`);
    if (r.guardado !== 'en') throw new Error(`localStorage bn-lang = ${r.guardado}`);
    if (!r.href.includes('I%E2%80%99d%20like')) throw new Error(`el asunto del correo no se tradujo: ${r.href}`);
  });
  await step(page, 'escritorio es: los contadores llegan a su valor', async () => {
    await centrar(page, '.figures');
    await contadoresListos(page, '.figures [data-count]');
    await centrar(page, '#roadmap .roadmap__summary');
    await contadoresListos(page);
  });
  await page.context().close();
}

console.log('Celular 390×844, ?lang=en');
{
  const page = await abrir(celular);
  await step(page, 'celular en: carga sin errores', async () => {
    await page.goto(`${base}/?lang=en`);
    await page.waitForLoadState('load');
    await esperaIntro(page);
  });
  await step(page, 'celular en: el menú abre con el botón y cierra con Escape', async () => {
    const toggle = page.locator('.menu-toggle');
    await toggle.click();
    await page.waitForFunction(() => document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'true', null, { timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'false', null, { timeout: 3000 });
  });
  await step(page, 'celular en', async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(1500);   // las secciones se revelan al entrar en pantalla
    const d = await desborde(page);
    if (d > 0) throw new Error(`desborda ${d} px`);
  });
  await page.context().close();
}

console.log('Celular 390×844, ?lang=es, menos movimiento');
{
  const page = await abrir({ ...celular, reducedMotion: 'reduce' });
  await step(page, 'celular es (menos movimiento): sin intro y con todo en su sitio', async () => {
    await page.goto(`${base}/?lang=es`);
    await page.waitForLoadState('load');
    const r = await page.evaluate(() => ({
      intro: document.querySelectorAll('.intro').length,
      done: document.documentElement.classList.contains('intro-done'),
      pendientes: Array.from(document.querySelectorAll('[data-count]')).filter((el) => el.textContent !== el.dataset.count + (el.dataset.suffix || '')).map((el) => el.textContent),
    }));
    if (r.intro) throw new Error('la intro sigue en el DOM');
    if (!r.done) throw new Error('html no tiene intro-done al cargar');
    if (r.pendientes.length) throw new Error(`contadores sin su valor final: ${r.pendientes.join(', ')}`);
  });
  await step(page, 'celular es (menos movimiento): sin desborde', async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const d = await desborde(page);
    if (d > 0) throw new Error(`desborda ${d} px`);
  });
  await page.context().close();
}

console.log('Escritorio sin ?lang, locale es-CL');
{
  const page = await abrir({ ...escritorio, locale: 'es-CL' });
  await step(page, 'escritorio es-CL: arranca en español', async () => {
    await page.goto(`${base}/`);
    await page.waitForLoadState('load');
    const lang = await page.evaluate(() => document.documentElement.lang);
    if (lang !== 'es') throw new Error(`html[lang] = ${lang}`);
  });
  await page.context().close();
}

await browser.close();
server.close();

const segundos = ((Date.now() - t0) / 1000).toFixed(1).replace('.', ',');
if (fallos) {
  console.log(`\n${fallos} fallo(s).`);
  process.exit(1);
}
console.log(`\nTodo bien en ${segundos} s.`);
