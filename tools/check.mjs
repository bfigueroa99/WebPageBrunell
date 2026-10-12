#!/usr/bin/env node
/* Comprobación estática del sitio: sintaxis de los JS, paridad de claves entre el HTML
   (español) y assets/js/i18n.js (inglés), anclas, ids, imágenes sin alt, rutas locales
   que no existen y hosts externos fuera de la lista permitida.

     node tools/check.mjs [--raiz <dir>]

   Salida: una línea `FALLA <archivo>:<línea> <motivo>` por caso, `AVISO …` por lo que no
   falla (texto sin traducir) y, al final, un resumen. Códigos de salida: 0 ok · 1 hay
   fallas · 2 no evaluable (i18n.js no evalúa).

   Por qué: applyLang cae al español en silencio si falta una clave, y nadie vigila anclas,
   ids ni hosts externos en una página que promete que nada sale a internet. */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// Único tráfico externo admitido (hoy: Google Fonts). Vaciar la lista cuando las fuentes sean propias.
const HOSTS_PERMITIDOS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const EXCLUIR_DIRS = new Set(['.git', 'tools', 'node_modules', 'docs']);
const VACIOS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const ETIQUETAS_CONTADAS = ['br', 'b', 'em', 'strong'];

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] != null ? args[i + 1] : null; };
const raiz = resolve(opt('--raiz') || join(dirname(fileURLToPath(import.meta.url)), '..'));
const rel = (p) => relative(raiz, p).split('\\').join('/');

const fallas = [];
const avisos = [];
const falla = (archivo, lineaN, motivo) => fallas.push(`FALLA ${archivo}:${lineaN} ${motivo}`);

/* ---------- 1. Sintaxis de los JS ---------- */

const dirJs = join(raiz, 'assets', 'js');
const archivosJs = existsSync(dirJs) ? readdirSync(dirJs).filter((f) => f.endsWith('.js')).sort().map((f) => join(dirJs, f)) : [];
for (const f of archivosJs) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.log(`FALLA ${rel(f)} no pasa node --check:\n${r.stderr.trim()}`);
    process.exit(1);
  }
}

/* ---------- 2. Evaluar i18n.js ---------- */

const rutaI18n = join(dirJs, 'i18n.js');
let en;
try {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(rutaI18n, 'utf8'), sandbox, { filename: 'i18n.js' });
  en = sandbox.window.BrunellI18n?.en;
  if (!en || typeof en !== 'object') throw new Error('no define window.BrunellI18n.en');
} catch (e) {
  console.log(`FALLA assets/js/i18n.js no evalúa: ${e.message}`);
  process.exit(2);
}
const srcI18n = readFileSync(rutaI18n, 'utf8');
const lineaClaveEn = (k) => {
  const m = new RegExp(`^\\s*'${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':`, 'm').exec(srcI18n);
  return m ? srcI18n.slice(0, m.index).split('\n').length : 0;
};

/* ---------- 3. Recorrer los HTML ---------- */

const htmls = [];
for (const e of readdirSync(raiz, { withFileTypes: true })) {
  if (e.isFile() && e.name.endsWith('.html')) htmls.push(join(raiz, e.name));
  else if (e.isDirectory() && !EXCLUIR_DIRS.has(e.name)) {
    for (const f of readdirSync(join(raiz, e.name))) if (f.endsWith('.html')) htmls.push(join(raiz, e.name, f));
  }
}
htmls.sort();

const usadas = new Map();      // clave → [{archivo, línea, es}] (es: innerHTML del español, null en atributos)
const hostsVistos = new Set();
let anclasRotas = 0;
let idsDuplicados = 0;

function parsearAttrs(s) {
  const out = {};
  const re = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(s))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

const esExterna = (v) => /^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('//');
const hostDe = (v) => { try { return new URL(v.startsWith('//') ? `https:${v}` : v).host; } catch { return null; } };

function revisarHost(archivo, lineaN, valor, donde) {
  if (!valor || valor.startsWith('data:') || valor.startsWith('#')) return;
  if (!esExterna(valor)) return;
  const host = hostDe(valor);
  if (!host) return;
  hostsVistos.add(host);
  if (!HOSTS_PERMITIDOS.includes(host)) falla(archivo, lineaN, `host externo ${host} en ${donde} (permitidos: ${HOSTS_PERMITIDOS.join(', ') || 'ninguno'})`);
}

function revisarLocal(archivo, lineaN, valor, baseDir, donde) {
  if (!valor || esExterna(valor) || valor.startsWith('#') || valor.startsWith('data:')) return;
  const limpio = valor.split(/[?#]/)[0];
  if (!limpio) return;
  const destino = limpio.startsWith('/') ? join(raiz, limpio) : join(baseDir, limpio);
  if (!existsSync(destino)) falla(archivo, lineaN, `${donde}="${valor}" no existe`);
}

function revisarHtml(ruta) {
  const archivo = rel(ruta);
  const baseDir = dirname(ruta);
  const original = readFileSync(ruta, 'utf8');
  // Los comentarios se vacían conservando los saltos de línea, así las líneas siguen valiendo.
  const html = original.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
  const ids = new Map();
  const anclas = [];
  const pila = [];              // elementos abiertos: { nombre, i18n: {clave, línea, fin} | null }
  let pos = 0, lineaN = 1;
  const lineaEn = (idx) => { for (; pos < idx; pos++) if (html.charCodeAt(pos) === 10) lineaN++; return lineaN; };

  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const [todo, cierra, nombreCrudo, attrsCrudos] = m;
    const nombre = nombreCrudo.toLowerCase();
    const l = lineaEn(m.index);
    if (cierra) {
      // Cierre tolerante: si el nombre no está arriba de la pila, se busca más abajo.
      const idx = pila.map((p) => p.nombre).lastIndexOf(nombre);
      if (idx < 0) continue;
      const cerrados = pila.splice(idx);
      for (const p of cerrados) {
        if (p.i18n) usadas.get(p.i18n.clave).push({ archivo, linea: p.i18n.linea, es: html.slice(p.i18n.fin, m.index).trim() });
      }
      continue;
    }
    const autoCierra = attrsCrudos.trimEnd().endsWith('/');
    const attrs = parsearAttrs(autoCierra ? attrsCrudos.trimEnd().slice(0, -1) : attrsCrudos);

    if (attrs.id != null) {
      if (ids.has(attrs.id)) { idsDuplicados++; falla(archivo, l, `id="${attrs.id}" duplicado (ya está en la línea ${ids.get(attrs.id)})`); }
      else ids.set(attrs.id, l);
    }
    if (nombre === 'a' && attrs.href?.startsWith('#') && attrs.href !== '#') anclas.push({ id: attrs.href.slice(1), linea: l });
    if (nombre === 'img' && attrs.alt == null) falla(archivo, l, '<img> sin alt');

    if (attrs.src != null) {
      if (['script', 'img', 'iframe'].includes(nombre)) revisarHost(archivo, l, attrs.src, `<${nombre} src>`);
      revisarLocal(archivo, l, attrs.src, baseDir, 'src');
    }
    if (attrs.href != null) {
      if (nombre === 'link') revisarHost(archivo, l, attrs.href, '<link href>');
      revisarLocal(archivo, l, attrs.href, baseDir, 'href');
    }
    if (attrs.srcset != null) {
      for (const parte of attrs.srcset.split(',')) {
        const url = parte.trim().split(/\s+/)[0];
        revisarHost(archivo, l, url, 'srcset');
        revisarLocal(archivo, l, url, baseDir, 'srcset');
      }
    }

    const claveAttr = (clave) => { if (!usadas.has(clave)) usadas.set(clave, []); };
    if (attrs['data-i18n-attr'] != null) {
      for (const par of attrs['data-i18n-attr'].split(';')) {
        const [a, k] = par.split(':').map((s) => s.trim());
        if (!a || !k) { falla(archivo, l, `data-i18n-attr mal formado: "${par.trim()}"`); continue; }
        claveAttr(k);
        usadas.get(k).push({ archivo, linea: l, es: null });
      }
    }
    if (attrs['data-i18n-subject'] != null) {
      claveAttr(attrs['data-i18n-subject']);
      usadas.get(attrs['data-i18n-subject']).push({ archivo, linea: l, es: null });
    }
    let i18n = null;
    if (attrs['data-i18n'] != null) {
      claveAttr(attrs['data-i18n']);
      i18n = { clave: attrs['data-i18n'], linea: l, fin: m.index + todo.length };
      if (VACIOS.has(nombre) || autoCierra) { usadas.get(i18n.clave).push({ archivo, linea: l, es: '' }); i18n = null; }
    }
    if (nombre === 'script' || nombre === 'style') {
      // El contenido es opaco: se salta hasta su cierre.
      const fin = html.indexOf(`</${nombre}`, re.lastIndex);
      if (fin >= 0) re.lastIndex = fin;
      continue;
    }
    if (!VACIOS.has(nombre) && !autoCierra) pila.push({ nombre, i18n });
  }
  for (const p of pila) if (p.i18n) falla(archivo, p.i18n.linea, `<${p.nombre} data-i18n="${p.i18n.clave}"> no se cierra`);
  for (const a of anclas) if (!ids.has(a.id)) { anclasRotas++; falla(archivo, a.linea, `href="#${a.id}" sin id="${a.id}"`); }
}

for (const h of htmls) revisarHtml(h);

/* ---------- 3b. Hosts externos en el CSS ---------- */

const dirCss = join(raiz, 'assets', 'css');
for (const f of existsSync(dirCss) ? readdirSync(dirCss).filter((x) => x.endsWith('.css')).sort() : []) {
  const ruta = join(dirCss, f);
  const css = readFileSync(ruta, 'utf8');
  const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/g;
  let m;
  while ((m = re.exec(css))) {
    const v = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    const l = css.slice(0, m.index).split('\n').length;
    revisarHost(rel(ruta), l, v, 'url()');
    revisarLocal(rel(ruta), l, v, dirCss, 'url()');
  }
}

/* ---------- 4. Claves: HTML + JS contra en ---------- */

const porJs = new Set();
for (const f of archivosJs) {
  if (f === rutaI18n) continue;     // i18n.js define las claves, no las usa
  const src = readFileSync(f, 'utf8');
  const re = /['"]([\w-]+(?:\.[\w-]+)+)['"]/g;
  let m;
  while ((m = re.exec(src))) if (m[1] in en && !usadas.has(m[1])) porJs.add(m[1]);
}

const contar = (s, tag) => (s.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;
const normalizar = (s) => s.replace(/\s+/g, ' ').trim();
const sinTraducir = new Set();    // un AVISO por clave, aunque se use en varios lugares
for (const [clave, usos] of usadas) {
  for (const u of usos) {
    if (!(clave in en)) { falla(u.archivo, u.linea, `clave ${clave} sin texto en en (assets/js/i18n.js)`); continue; }
    const valor = en[clave];
    if (typeof valor !== 'string' || !valor.trim()) { falla(u.archivo, u.linea, `clave ${clave}: el valor en en está vacío`); continue; }
    if (u.es == null) continue;
    for (const tag of ETIQUETAS_CONTADAS) {
      const [a, b] = [contar(u.es, tag), contar(valor, tag)];
      if (a !== b) falla(u.archivo, u.linea, `clave ${clave}: ${a} <${tag}> en es y ${b} en en`);
    }
    if (normalizar(u.es) === normalizar(valor) && !sinTraducir.has(clave)) {
      sinTraducir.add(clave);
      avisos.push(`AVISO ${u.archivo}:${u.linea} clave ${clave} sin traducir: «${normalizar(valor)}»`);
    }
  }
}
let huerfanas = 0;
for (const k of Object.keys(en)) {
  if (usadas.has(k) || porJs.has(k)) continue;
  huerfanas++;
  falla('assets/js/i18n.js', lineaClaveEn(k), `clave en huérfana ${k} (ni en el HTML ni en assets/js/*.js)`);
}

/* ---------- 5. Informe ---------- */

for (const f of fallas) console.log(f);
for (const a of avisos) console.log(a);
if (fallas.length) {
  console.log(`${fallas.length} falla(s).`);
  process.exit(1);
}
console.log(`OK · ${htmls.length} html · ${usadas.size} claves usadas + ${porJs.size} por JS · en: ${Object.keys(en).length} · ${huerfanas} huérfanas · ${anclasRotas} anclas rotas · ${idsDuplicados} ids duplicados · hosts externos: ${hostsVistos.size}`);
