#!/usr/bin/env node
/* Cifras de la hoja de ruta tomadas del producto, no de la prosa.

     node tools/producto.mjs --medir [--brunell <dir>] [--sin-red] [--panel-cmd <cmd>]
         Lee origin/dev de Brunell_Node (el checkout, o un clon disperso si no hay),
         corre su panel `scripts/loop_progress.sh --check` sobre una copia exportada
         con `git archive` y escribe docs/producto.json. Nunca escribe en el checkout.
     node tools/producto.mjs --check        (por defecto; sin red)
         Compara docs/producto.json con los literales de index.html y assets/js/i18n.js.
     node tools/producto.mjs --aplicar
         Reescribe sólo esos literales y vuelve a comprobar. Idempotente.
     node tools/producto.mjs --json
         Imprime docs/producto.json (para el cuerpo del PR).
     --raiz <dir>   otra copia del sitio (pruebas)

   Códigos de salida: 0 ok · 1 desvío · 2 no evaluable (con 2 nunca se escribe nada).
   A mano quedan sólo «3×» (meta M1 del plan, 8→24 cámaras), `--now` de la línea de
   tiempo, las clases `stage--*` y qué ítems llevan `li.done`. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] != null ? args[i + 1] : null; };
const raiz = resolve(opt('--raiz') || join(dirname(fileURLToPath(import.meta.url)), '..'));
const RUTA_JSON = join(raiz, 'docs', 'producto.json');
const RUTA_HTML = join(raiz, 'index.html');
const RUTA_I18N = join(raiz, 'assets', 'js', 'i18n.js');

const REPO_PRODUCTO = 'https://github.com/bfigueroa99/Brunell_Node';
const CHECKOUT_PRODUCTO = '/home/user/Brunell_Node';
// El panel sólo lee los dos PRODUCT_LOOP; README y ROADMAP sirven a la revisión de fidelidad.
const ARCHIVOS_PANEL = ['docs/PRODUCT_LOOP.md', 'docs/PRODUCT_LOOP_ARCHIVE.md', 'docs/ROADMAP.md', 'README.md', 'scripts/loop_progress.sh'];
const FASES_ESPERADAS = ['0', '1', '2', '3'];
const DIAS_VIGENCIA = 7;
const MESES = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const MANUAL = { 'rsum.3': '3× = meta M1 del plan (8→24 cámaras)', '--now': '58 % a mano', 'li.done': 'narrativa, la revisa FIDELIDAD' };

const fallo = (msg) => { console.error(`FALLO: ${msg}`); process.exit(2); };
const aviso = (msg) => console.error(`AVISO: ${msg}`);
const git = (dir, ...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const linea = (texto, idx) => texto.slice(0, idx).split('\n').length;
/** Mayor múltiplo de 10 estrictamente menor que n: 901 → 900, 900 → 890, 441 → 440. */
const masDe = (n) => Math.ceil(n / 10) * 10 - 10;
const pctFase = (hechos, total) => Math.floor((100 * hechos) / total);

/* ---------- --medir ---------- */

/** Orden por versión: v2.10.0 antes que v2.9.0. */
function ultimaVersion(tags) {
  const partes = (t) => t.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
  const lista = tags.filter((t) => /^v\d+(\.\d+)*$/.test(t));
  lista.sort((a, b) => {
    const [pa, pb] = [partes(a), partes(b)];
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pb[i] || 0) - (pa[i] || 0);
      if (d) return d;
    }
    return 0;
  });
  return lista[0] || null;
}

/** Devuelve { dir, origen } con origin/dev listo para leer; nunca toca el checkout. */
function ubicarProducto(tmp) {
  const sinRed = flag('--sin-red');
  const dir = opt('--brunell') || process.env.BRUNELL_NODE || CHECKOUT_PRODUCTO;
  if (existsSync(dir)) {
    if (git(dir, 'rev-parse', '--git-dir').status !== 0) fallo(`${dir} existe pero no es un repo git`);
    const local = () => git(dir, 'rev-parse', '--short=12', 'origin/dev').stdout.trim();
    const fetched = sinRed ? null : git(dir, 'fetch', '-q', 'origin', 'dev');
    if (!fetched || fetched.status !== 0) {
      const sha = local();
      if (!sha) fallo(`sin red y sin origin/dev local en ${dir}`);
      aviso(`sin red, uso origin/dev local ${sha}`);
    }
    return { dir, origen: 'checkout' };
  }
  if (sinRed) fallo(`no pude obtener Brunell_Node (sin red y sin checkout en ${dir})`);
  const clon = join(tmp, 'clon');
  const c = spawnSync('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--sparse', '-b', 'dev', REPO_PRODUCTO, clon], { encoding: 'utf8' });
  if (c.status !== 0) fallo(`no pude obtener Brunell_Node (${(c.stderr || c.error?.message || '').trim().split('\n').pop() || `git clone salió con ${c.status}`})`);
  const s = git(clon, 'sparse-checkout', 'set', 'docs', 'scripts');
  if (s.status !== 0) fallo(`no pude obtener Brunell_Node (${s.stderr.trim()})`);
  return { dir: clon, origen: 'clon' };
}

/** Parsea la salida del panel: Backlog, Fase N y la línea «quedan:» que sigue a cada fase. */
function parsearPanel(salida) {
  const lineas = salida.split('\n');
  const res = { backlog: null, fases: {}, lineasPanel: [] };
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const b = /^Backlog: (\d+)\/(\d+) ítems cerrados \((\d+)%\) · (\d+) abiertos/.exec(l);
    if (b) {
      res.backlog = { cerrados: +b[1], total: +b[2], pct: +b[3], abiertos: +b[4] };
      res.lineasPanel.push(l);
      continue;
    }
    const f = /^Fase (\d+) ([^:]+): (\d+)\/(\d+) ítems \((\d+)%\)/.exec(l);
    if (f) {
      const q = /^\s*quedan: (.+)$/.exec(lineas[i + 1] || '');
      res.fases[f[1]] = { nombre: f[2].trim(), hechos: +f[3], total: +f[4], pct: +f[5], quedan: q ? q[1].split(',').map((s) => s.trim()).filter(Boolean) : [] };
      res.lineasPanel.push(l);
      if (q) res.lineasPanel.push(lineas[i + 1]);
    }
  }
  return res;
}

const compacto = (v) => Array.isArray(v) ? `[${v.map(compacto).join(', ')}]`
  : v && typeof v === 'object' ? (Object.keys(v).length ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${compacto(x)}`).join(', ')} }` : '{}')
    : JSON.stringify(v);

function formatearJson(j) {
  return [
    '{',
    `  "medido_en": ${JSON.stringify(j.medido_en)},`,
    `  "commit_dev": ${JSON.stringify(j.commit_dev)},`,
    `  "fecha_dev": ${JSON.stringify(j.fecha_dev)},`,
    `  "origen": ${JSON.stringify(j.origen)},`,
    `  "backlog": ${compacto(j.backlog)},`,
    '  "fases": {',
    ...Object.entries(j.fases).map(([k, f], i, arr) => `    ${JSON.stringify(k)}: ${compacto(f)}${i < arr.length - 1 ? ',' : ''}`),
    '  },',
    `  "release": ${JSON.stringify(j.release)},`,
    `  "manual": ${compacto(j.manual)}`,
    '}',
    '',
  ].join('\n');
}

function medir() {
  const tmp = mkdtempSync(join(os.tmpdir(), 'producto-'));
  // También tras un FALLO (process.exit salta el finally).
  process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
  try {
    const { dir, origen } = ubicarProducto(tmp);
    const exp = join(tmp, 'export');
    mkdirSync(exp);
    const a = spawnSync('git', ['-C', dir, 'archive', 'origin/dev', ...ARCHIVOS_PANEL], { maxBuffer: 256 * 1024 * 1024 });
    if (a.status !== 0) fallo(`no pude exportar origin/dev (${String(a.stderr).trim()})`);
    const t = spawnSync('tar', ['-x', '-C', exp], { input: a.stdout });
    if (t.status !== 0) fallo(`no pude desempaquetar la exportación (${String(t.stderr).trim()})`);

    const cmd = opt('--panel-cmd') || 'bash scripts/loop_progress.sh --check';
    const p = spawnSync('bash', ['-c', cmd], { cwd: exp, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (p.status !== 0) fallo(`no pude leer el panel (el panel salió con ${p.status ?? p.signal}: ${(p.stderr || '').trim().split('\n').pop() || 'sin detalle'})`);
    const panel = parsearPanel(p.stdout || '');
    if (!panel.backlog) fallo('no pude leer el panel (falta la línea «Backlog: a/b ítems cerrados (p%) · n abiertos»)');
    const faltan = FASES_ESPERADAS.filter((k) => !panel.fases[k]);
    if (faltan.length) fallo(`no pude leer el panel (falta la Fase ${faltan.join(', la Fase ')})`);

    const log = git(dir, 'log', '-1', '--format=%H%n%cI', 'origin/dev');
    if (log.status !== 0) fallo(`no pude leer origin/dev (${log.stderr.trim()})`);
    const [sha, fecha] = log.stdout.trim().split('\n');
    let tags;
    if (origen === 'checkout') {
      tags = git(dir, 'tag', '--list', 'v*').stdout.split('\n');
    } else {
      // El clon disperso no trae tags: se preguntan al remoto.
      tags = git(dir, 'ls-remote', '--tags', 'origin', 'v*').stdout.split('\n')
        .map((l) => l.split('\t')[1] || '').filter((r) => r && !r.endsWith('^{}')).map((r) => r.replace('refs/tags/', ''));
    }
    const json = {
      medido_en: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      commit_dev: sha.slice(0, 12),
      fecha_dev: fecha.slice(0, 10),
      origen,
      backlog: panel.backlog,
      fases: Object.fromEntries(FASES_ESPERADAS.map((k) => [k, panel.fases[k]])),
      release: ultimaVersion(tags.map((s) => s.trim())),
      manual: MANUAL,
    };
    mkdirSync(dirname(RUTA_JSON), { recursive: true });
    writeFileSync(RUTA_JSON, formatearJson(json));
    for (const l of panel.lineasPanel) console.log(l);
    console.log(`origin/dev ${json.commit_dev} ${json.fecha_dev} · release ${json.release ?? 'ninguna'}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/* ---------- --check / --aplicar ---------- */

function leerJson() {
  if (!existsSync(RUTA_JSON)) fallo('corré --medir (no existe docs/producto.json)');
  let j;
  try { j = JSON.parse(readFileSync(RUTA_JSON, 'utf8')); } catch (e) { fallo(`corré --medir (docs/producto.json ilegible: ${e.message})`); }
  const edad = (Date.now() - Date.parse(j.medido_en)) / 86400000;
  if (!(edad <= DIAS_VIGENCIA)) fallo(`corré --medir (docs/producto.json medido hace ${Number.isFinite(edad) ? Math.floor(edad) : '?'} días)`);
  if (!j.backlog || !j.fases || FASES_ESPERADAS.some((k) => !j.fases[k])) fallo('corré --medir (docs/producto.json incompleto)');
  return j;
}

const attr = (tag, nombre) => { const m = new RegExp(`\\b${nombre}="([^"]*)"`).exec(tag); return m ? m[1] : null; };
const conAttr = (tag, nombre, valor) => tag.replace(new RegExp(`\\b${nombre}="[^"]*"`), `${nombre}="${valor}"`);
const regexEn = (clave) => new RegExp(`('${clave.replace('.', '\\.')}':\\s*')((?:[^'\\\\]|\\\\.)*)(')`);

/** Compara (y con `aplicar`, corrige) cada literal. Devuelve las líneas del informe y los textos nuevos. */
function evaluar(j, html, i18n, aplicar) {
  const out = { lineas: [], fallas: 0, cambios: 0 };
  const ok = (msg) => out.lineas.push(`✓ ${msg}`);
  const mal = (msg) => { out.fallas++; out.lineas.push(`✗ ${msg}`); };
  const cita = (archivo, texto, idx) => `${archivo}:${linea(texto, idx)}`;

  /** Un literal: si difiere, lo anota y, con `aplicar`, devuelve el reemplazo. */
  const literal = (nombre, actual, esperado, donde, reemplazar) => {
    if (actual === esperado) { ok(`${nombre}: ${esperado}`); return false; }
    mal(`${nombre}: la página dice ${actual ?? '(nada)'} (${donde}), medido ${esperado}`);
    if (aplicar && reemplazar) { reemplazar(); out.cambios++; return true; }
    return false;
  };
  const enI18n = (clave) => { const m = regexEn(clave).exec(i18n); return m ? { m, valor: m[2], idx: m.index } : null; };
  const ponerEn = (clave, valor) => { i18n = i18n.replace(regexEn(clave), `$1${valor}$3`); };

  // backlog.pct y backlog.cerrados en el resumen (.rsum__num): data-count y texto.
  for (const [cifra, esperado, texto] of [['backlog.pct', j.backlog.pct, `${j.backlog.pct}%`], ['backlog.cerrados', j.backlog.cerrados, String(j.backlog.cerrados)]]) {
    const re = new RegExp(`<span\\b([^>]*\\bclass="[^"]*\\brsum__num\\b[^"]*"[^>]*\\bdata-cifra="${cifra.replace('.', '\\.')}"[^>]*)>([^<]*)</span>`);
    const m = re.exec(html);
    if (!m) { mal(`${cifra}: no hay <span class="rsum__num" data-cifra="${cifra}"> en index.html`); continue; }
    const donde = cita('index.html', html, m.index);
    const tag = `<span${m[1]}>`;
    let nuevoTag = tag, nuevoTexto = m[2];
    literal(`${cifra} data-count`, attr(tag, 'data-count'), String(esperado), donde, () => { nuevoTag = conAttr(nuevoTag, 'data-count', String(esperado)); });
    literal(`${cifra} texto`, m[2].trim(), texto, donde, () => { nuevoTexto = texto; });
    if (aplicar) html = html.slice(0, m.index) + `${nuevoTag}${nuevoTexto}</span>` + html.slice(m.index + m[0].length);
  }

  // Etapas: cada article.stage[data-fase] contra su fase del panel.
  for (const k of FASES_ESPERADAS) {
    const f = j.fases[k];
    const re = new RegExp(`<article\\b[^>]*\\bdata-fase="${k}"[^>]*>([\\s\\S]*?)</article>`);
    const m = re.exec(html);
    if (!m) { mal(`etapa data-fase=${k}: no hay <article data-fase="${k}"> en index.html (Fase ${k} ${f.nombre})`); continue; }
    const cuerpo = m[1];
    const small = /<small\b[^>]*\bdata-i18n="(stage\d+\.progress)"[^>]*>([^<]*)<\/small>/.exec(cuerpo);
    const barra = /<i style="--p: (\d+)%"><\/i>/.exec(cuerpo);
    if (!small || !barra) { mal(`etapa data-fase=${k}: falta <small data-i18n="stageN.progress"> o <i style="--p: N%">`); continue; }
    const donde = cita('index.html', html, m.index + small.index);
    const esperadoEs = `${f.hechos} de ${f.total} objetivos`;
    const esperadoEn = `${f.hechos} of ${f.total} goals`;
    const esperadoP = String(pctFase(f.hechos, f.total));
    const en = enI18n(small[1]);
    const antes = out.fallas;
    let nuevoCuerpo = cuerpo;
    literal(`etapa data-fase=${k} es`, small[2].trim(), esperadoEs, donde, () => { nuevoCuerpo = nuevoCuerpo.replace(small[0], small[0].replace(small[2], esperadoEs)); });
    literal(`etapa data-fase=${k} --p`, barra[1], esperadoP, donde, () => { nuevoCuerpo = nuevoCuerpo.replace(barra[0], `<i style="--p: ${esperadoP}%"></i>`); });
    if (!en) mal(`etapa data-fase=${k} en: falta '${small[1]}' en assets/js/i18n.js`);
    else literal(`etapa data-fase=${k} en`, en.valor, esperadoEn, cita('assets/js/i18n.js', i18n, en.idx), () => ponerEn(small[1], esperadoEn));
    if (out.fallas === antes) {
      // Las tres ✓ se resumen en una sola línea legible.
      out.lineas.splice(-3, 3, `✓ etapa data-fase=${k} ← Fase ${k} ${f.nombre}: ${f.hechos} de ${f.total}`);
    }
    if (aplicar && nuevoCuerpo !== cuerpo) html = html.replace(m[0], m[0].replace(cuerpo, nuevoCuerpo));
  }

  // «Más de M» / «More than M»: M es el mayor múltiplo de 10 menor que los cerrados.
  {
    const M = String(masDe(j.backlog.cerrados));
    const m = /<li\b[^>]*\bdata-cifra-formato="mas-de"[^>]*>([^<]*)<\/li>/.exec(html);
    if (!m) mal('mas-de: no hay <li data-cifra-formato="mas-de"> en index.html');
    else {
      const tag = m[0].slice(0, m[0].indexOf('>') + 1);
      const clave = attr(tag, 'data-i18n');
      const es = /^Más de (\d+)\b/.exec(m[1].trim());
      const donde = cita('index.html', html, m.index);
      if (!es) mal(`mas-de: el texto no empieza con «Más de N» (${donde}): «${m[1].trim()}»`);
      else literal('mas-de es', es[1], M, donde, () => { html = html.replace(m[0], m[0].replace(m[1], m[1].replace(/Más de \d+/, `Más de ${M}`))); });
      const en = clave ? enI18n(clave) : null;
      const enM = en ? /^More than (\d+)\b/.exec(en.valor) : null;
      if (!en) mal(`mas-de en: falta '${clave}' en assets/js/i18n.js`);
      else if (!enM) mal(`mas-de en: '${clave}' no empieza con «More than N» (assets/js/i18n.js:${linea(i18n, en.idx)}): «${en.valor}»`);
      else literal('mas-de en', enM[1], M, cita('assets/js/i18n.js', i18n, en.idx), () => ponerEn(clave, en.valor.replace(/More than \d+/, `More than ${M}`)));
    }
  }

  // Eyebrow de la hoja de ruta: mes y año de origin/dev.
  {
    const [anio, mes] = j.fecha_dev.split('-');
    const esperadoEs = `Hoja de ruta · ${MESES.es[+mes - 1]} ${anio}`;
    const esperadoEn = `Roadmap · ${MESES.en[+mes - 1]} ${anio}`;
    const m = /<p\b[^>]*\bdata-i18n="roadmap\.eyebrow"[^>]*>([^<]*)<\/p>/.exec(html);
    if (!m) mal('roadmap.eyebrow: no hay <p data-i18n="roadmap.eyebrow"> en index.html');
    else literal('roadmap.eyebrow es', m[1].trim(), esperadoEs, cita('index.html', html, m.index), () => { html = html.replace(m[0], m[0].replace(m[1], esperadoEs)); });
    const en = enI18n('roadmap.eyebrow');
    if (!en) mal("roadmap.eyebrow en: falta 'roadmap.eyebrow' en assets/js/i18n.js");
    else literal('roadmap.eyebrow en', en.valor, esperadoEn, cita('assets/js/i18n.js', i18n, en.idx), () => ponerEn('roadmap.eyebrow', esperadoEn));
  }

  return { ...out, html, i18n };
}

function leerSitio() {
  for (const r of [RUTA_HTML, RUTA_I18N]) if (!existsSync(r)) fallo(`no existe ${r}`);
  return { html: readFileSync(RUTA_HTML, 'utf8'), i18n: readFileSync(RUTA_I18N, 'utf8') };
}

function check() {
  const j = leerJson();
  const { html, i18n } = leerSitio();
  const r = evaluar(j, html, i18n, false);
  for (const l of r.lineas) console.log(l);
  console.log(`cifras: origin/dev ${j.commit_dev} (${j.fecha_dev}) · ${r.fallas ? `${r.fallas} desvío(s)` : 'la página coincide con el panel'}`);
  process.exit(r.fallas ? 1 : 0);
}

function aplicar() {
  const j = leerJson();
  const { html, i18n } = leerSitio();
  const r = evaluar(j, html, i18n, true);
  if (r.html !== html) writeFileSync(RUTA_HTML, r.html);
  if (r.i18n !== i18n) writeFileSync(RUTA_I18N, r.i18n);
  const despues = evaluar(j, r.html, r.i18n, false);
  for (const l of despues.lineas) console.log(l);
  console.log(`aplicado: ${r.cambios} cambios`);
  process.exit(despues.fallas ? 1 : 0);
}

const modos = args.filter((a) => ['--medir', '--check', '--aplicar', '--json'].includes(a));
if (modos.length > 1 || args.some((a) => a.startsWith('--') && !['--medir', '--check', '--aplicar', '--json', '--brunell', '--sin-red', '--panel-cmd', '--raiz'].includes(a))) {
  console.error('uso: node tools/producto.mjs [--medir [--brunell <dir>] [--sin-red] [--panel-cmd <cmd>] | --check | --aplicar | --json] [--raiz <dir>]');
  process.exit(2);
}
if (modos[0] === '--medir') medir();
else if (modos[0] === '--aplicar') aplicar();
else if (modos[0] === '--json') { if (!existsSync(RUTA_JSON)) fallo('corré --medir (no existe docs/producto.json)'); process.stdout.write(readFileSync(RUTA_JSON, 'utf8')); }
else check();
