#!/usr/bin/env node
/* El loop sin memoria: decide la próxima iteración a partir de MEJORAS.md y vigila que ese
   archivo, docs/ROUTINE.md y docs/producto.json no se degraden.

     node tools/loop.mjs --siguiente [--archivo <ruta>] [--sin-git] [--raiz <dir>]
         Lee MEJORAS.md (y BITACORA_ARCHIVO.md si existe) de origin/master —sin remoto o con
         --sin-git, el archivo local, con AVISO—, calcula N = última iteración + 1, el modo por
         N mod 4, el ítem y la rama, y pregunta a GitHub si ya hay un PR abierto para N.
         Imprime una línea `N=… modo=… eje=… item="…" motivo="…" cifras=… rama=loop/N-slug`.
         Salida: 0 decidido · 2 no puede decidir · 3 ya hay PR abierto para esa iteración.
     node tools/loop.mjs --check [--en-curso] [--archivo <ruta>] [--sin-git] [--raiz <dir>]
         Ocho guardas sobre los archivos locales; una línea `FALLA guarda n: …` por falla.
         Salida: 0 ok · 1 hay fallas · 2 no evaluable. Con --en-curso la última entrada de la
         bitácora puede decir «PR: pendiente». */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECCIONES = ['Directiva vigente', 'Cómo elige cada iteración', 'Mapa de alcance', 'Hoja de ruta', 'Calidad: pendientes', 'Pendiente de Benjamin', 'Cómo validar', 'Bitácora'];
const EJES = ['Fidelidad', 'Descubribilidad', 'Contenido', 'Conversión', 'Accesibilidad', 'Rendimiento y privacidad', 'Idiomas'];
const MODOS = { 1: 'FIDELIDAD', 2: 'EXPANSION', 3: 'CALIDAD', 0: 'EXPANSION' };
const MIN_PENDIENTES = 8;
const MAX_ENTRADAS = 12;
const MAX_BYTES = 40000;
const MAX_PROMPT = 1500;
const REPO = 'bfigueroa99/WebPageBrunell';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] != null ? args[i + 1] : null; };
const raiz = resolve(opt('--raiz') || join(dirname(fileURLToPath(import.meta.url)), '..'));
const archivoMejoras = opt('--archivo') ? resolve(opt('--archivo')) : join(raiz, 'MEJORAS.md');
const sinGit = flag('--sin-git') || !!opt('--archivo');
const aviso = (m) => console.error(`AVISO: ${m}`);
const noEvaluable = (m) => { console.error(`FALLO: ${m}`); process.exit(2); };
const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = (s) => sinAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');

/* ---------- Lectura ---------- */

/** Texto del archivo en origin/master; null si no está ahí. Lanza si no hay remoto. */
function deMaster(rutaRel) {
  const r = spawnSync('git', ['-C', raiz, 'show', `origin/master:${rutaRel}`], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout;
  if (/exists on disk, but not in|does not exist in/.test(r.stderr)) return null;
  throw new Error(r.stderr.trim().split('\n')[0]);
}
const local = (ruta) => (existsSync(ruta) ? readFileSync(ruta, 'utf8') : null);

/* ---------- Parseo de MEJORAS.md ---------- */

function secciones(texto) {
  const map = new Map();
  let actual = null;
  for (const l of texto.split('\n')) {
    const m = /^## (.+?)\s*$/.exec(l);
    if (m) { actual = m[1]; map.set(actual, []); continue; }
    if (actual) map.get(actual).push(l);
  }
  for (const [k, v] of map) map.set(k, v.join('\n'));
  return map;
}

/** Entradas de bitácora: `### AAAA-MM-DD · Iteración N · MODO · Eje` y su cuerpo. */
function entradas(texto) {
  const out = [];
  let actual = null;
  for (const l of texto.split('\n')) {
    const m = /^### (\S+) · Iteración (\d+)(?: · ([^·]+?))?(?: · (.+?))?\s*$/.exec(l);
    if (m) { actual = { fecha: m[1], n: +m[2], modo: sinAcentos(m[3] || '').trim().toUpperCase(), eje: (m[4] || '').trim(), cuerpo: [] }; out.push(actual); continue; }
    if (/^### /.test(l)) { actual = null; continue; }
    if (actual) actual.cuerpo.push(l);
  }
  for (const e of out) e.cuerpo = e.cuerpo.join('\n');
  return out;
}

/** Ítems de la hoja de ruta: `N. **Título** · Eje. …` o `N. ~~**Título**~~ hecho en #k · Eje.` */
function hoja(texto) {
  const items = [];
  for (const l of texto.split('\n')) {
    const m = /^\s*(\d+)\.\s+(~~)?\*\*(.+?)\*\*(~~)?\s*(.*)$/.exec(l);
    if (!m) continue;
    const resto = m[5];
    const hecho = /hecho en #(\d+)/.exec(resto);
    const eje = /·\s*([^.·]+?)\s*\./.exec(resto);
    items.push({ n: +m[1], titulo: m[3].replace(/`/g, ''), tachado: !!(m[2] || m[4]), pr: hecho ? +hecho[1] : null, eje: eje ? eje[1].trim() : '' });
  }
  return items;
}

/** Viñetas de primer nivel de una sección (sólo su primera línea). */
const vinetas = (texto) => texto.split('\n').filter((l) => /^- /.test(l)).map((l) => l.slice(2).trim());

function leerTodo() {
  let mejoras, archivo, origen = 'origin/master';
  if (sinGit) {
    mejoras = local(archivoMejoras);
    archivo = local(join(raiz, 'BITACORA_ARCHIVO.md'));
    origen = archivoMejoras;
    aviso(`sin git: leo ${archivoMejoras}`);
  } else {
    try {
      mejoras = deMaster('MEJORAS.md');
      archivo = deMaster('BITACORA_ARCHIVO.md');
      if (mejoras == null) {
        aviso('MEJORAS.md todavía no está en origin/master: la bitácora fusionada está vacía, uso el archivo local para las reglas');
        mejoras = local(archivoMejoras);
        origen = `${archivoMejoras} (sin bitácora fusionada)`;
        if (mejoras != null) mejoras = { reglas: mejoras, bitacoraVacia: true };
      }
    } catch (e) {
      aviso(`sin remoto (${e.message}): leo el archivo local`);
      mejoras = local(archivoMejoras);
      archivo = local(join(raiz, 'BITACORA_ARCHIVO.md'));
      origen = archivoMejoras;
    }
  }
  if (mejoras == null) noEvaluable(`no pude leer MEJORAS.md (${origen})`);
  const bitacoraVacia = typeof mejoras === 'object';
  const texto = bitacoraVacia ? mejoras.reglas : mejoras;
  return { texto, archivo: archivo || '', bitacoraVacia, origen };
}

/* ---------- --siguiente ---------- */

function siguiente() {
  const { texto, archivo, bitacoraVacia } = leerTodo();
  const secs = secciones(texto);
  for (const s of ['Hoja de ruta', 'Calidad: pendientes', 'Bitácora']) if (!secs.has(s)) noEvaluable(`MEJORAS.md mal formado: falta «## ${s}»`);
  const bit = bitacoraVacia ? [] : [...entradas(secs.get('Bitácora')), ...entradas(archivo)];
  const N = (bit.length ? Math.max(...bit.map((e) => e.n)) : 0) + 1;
  const ultima = bit.length ? bit.reduce((a, b) => (b.n > a.n ? b : a)) : null;
  let modo = MODOS[N % 4];
  let item, eje, motivo;

  const pendientesCalidad = vinetas(secs.get('Calidad: pendientes'));
  const alta = pendientesCalidad.find((p) => /\*\*Alta\*\*/.test(p));
  if (alta) {
    modo = 'CALIDAD'; item = alta.replace(/\*\*Alta\*\*:?\s*/, ''); eje = 'Calidad'; motivo = 'pendiente Alta va antes que todo';
  } else if (modo === 'FIDELIDAD') {
    item = 'Revisión de fidelidad contra origin/dev de Brunell_Node'; eje = 'Fidelidad'; motivo = `N mod 4 = ${N % 4}`;
  } else if (modo === 'CALIDAD') {
    eje = 'Calidad';
    if (pendientesCalidad.length) { item = pendientesCalidad[0]; motivo = `N mod 4 = 3; primer pendiente de Calidad`; }
    else { item = 'QA activa en Chromium y comparar la Routine con docs/ROUTINE.md'; motivo = 'N mod 4 = 3; sin pendientes de Calidad'; }
  } else {
    const pendientes = hoja(secs.get('Hoja de ruta')).filter((i) => !i.tachado);
    if (!pendientes.length) noEvaluable('la hoja de ruta no tiene pendientes: hay que reponerla');
    const expansionPrevia = bit.filter((e) => e.modo === 'EXPANSION').sort((a, b) => b.n - a.n)[0];
    let elegido = pendientes[0];
    const ejeAnterior = ultima ? ultima.eje : null;
    motivo = `N mod 4 = ${N % 4}; primer pendiente de la Hoja${ejeAnterior ? `; eje distinto de ${ejeAnterior}` : ''}`;
    if (expansionPrevia && elegido.eje === expansionPrevia.eje) {
      const otro = pendientes.slice(0, 3).find((i) => i.eje !== expansionPrevia.eje);
      if (otro) { elegido = otro; motivo = `N mod 4 = ${N % 4}; el primero («${pendientes[0].titulo}») repite el eje ${expansionPrevia.eje} de la expansión anterior (iteración ${expansionPrevia.n})`; }
    }
    item = elegido.titulo; eje = elegido.eje || '?';
  }
  item = item.replace(/`/g, '').replace(/\s+/g, ' ').trim();

  const p = spawnSync(process.execPath, [join(raiz, 'tools', 'producto.mjs'), '--check', '--raiz', raiz], { encoding: 'utf8' });
  const cifras = p.status === 0 ? 'ok' : p.status === 1 ? 'desvío' : 'sin medir';
  if (p.status === 2) aviso(`cifras sin medir: ${(p.stderr || '').trim().split('\n').pop()}`);

  const gh = spawnSync('gh', ['api', `repos/${REPO}/pulls?state=open`, '--jq', '.[] | {number,title}'], { encoding: 'utf8' });
  if (gh.status !== 0) aviso(`no pude listar PRs (${(gh.stderr || gh.error?.message || '').trim().split('\n')[0] || 'gh no respondió'})`);
  else {
    for (const l of gh.stdout.split('\n').filter(Boolean)) {
      let pr;
      try { pr = JSON.parse(l); } catch { continue; }
      if (new RegExp(`Iteración\\s+${N}\\b`).test(pr.title)) {
        console.log(`ya hay PR #${pr.number} para la iteración ${N}: ${pr.title}`);
        process.exit(3);
      }
    }
  }
  const rama = `loop/${N}-${slug(modo === 'FIDELIDAD' && !alta ? 'fidelidad' : item)}`;
  console.log(`N=${N} modo=${modo} eje=${eje} item="${item}" motivo="${motivo}" cifras=${cifras} rama=${rama}`);
}

/* ---------- --check ---------- */

function check() {
  const enCurso = flag('--en-curso');
  const fallas = [];
  const falla = (n, m) => fallas.push(`FALLA guarda ${n}: ${m}`);
  const texto = local(archivoMejoras);
  if (texto == null) noEvaluable(`no existe ${archivoMejoras}`);
  const archivoBit = local(join(raiz, 'BITACORA_ARCHIVO.md')) || '';
  const secs = secciones(texto);

  // 1. secciones y ejes
  for (const s of SECCIONES) if (!secs.has(s)) falla(1, `falta la sección «## ${s}»`);
  const mapa = secs.get('Mapa de alcance') || '';
  for (const e of EJES) if (!new RegExp(`^\\| ${e} \\|`, 'm').test(mapa)) falla(1, `el Mapa de alcance no tiene la fila «| ${e} |»`);

  // 2 y 3. hoja de ruta
  const items = hoja(secs.get('Hoja de ruta') || '');
  const pendientes = items.filter((i) => !i.tachado);
  if (pendientes.length < MIN_PENDIENTES) falla(2, `la hoja de ruta tiene ${pendientes.length} pendientes (mínimo ${MIN_PENDIENTES}): reponer`);
  for (const i of items) if (i.tachado && i.pr == null) falla(3, `ítem ${i.n} «${i.titulo}» tachado sin «hecho en #n»`);

  // 4 y 5. bitácora
  const bit = [...entradas(secs.get('Bitácora') || ''), ...entradas(archivoBit)];
  const nums = bit.map((e) => e.n).sort((a, b) => a - b);
  const max = nums.length ? nums[nums.length - 1] : 0;
  for (let k = 1; k <= max; k++) {
    const veces = nums.filter((n) => n === k).length;
    if (veces === 0) falla(4, `falta la iteración ${k} en la bitácora`);
    if (veces > 1) falla(4, `la iteración ${k} está repetida (${veces} veces)`);
  }
  if (!bit.length) falla(5, 'la bitácora no tiene entradas');
  else {
    const ultima = bit.reduce((a, b) => (b.n > a.n ? b : a));
    if (!/\*\*Siguiente:\*\*/.test(ultima.cuerpo)) falla(5, `la iteración ${ultima.n} no tiene «**Siguiente:**»`);
    if (!/PR: #\d+/.test(ultima.cuerpo)) {
      if (enCurso && /PR: pendiente/.test(ultima.cuerpo)) { /* todavía no hay número */ }
      else falla(5, `la iteración ${ultima.n} no tiene «PR: #n»${/PR: pendiente/.test(ultima.cuerpo) ? ' (dice «PR: pendiente»; --en-curso lo acepta)' : ''}`);
    }
  }

  // 6. docs/ROUTINE.md
  const rutaRoutine = join(raiz, 'docs', 'ROUTINE.md');
  const routine = local(rutaRoutine);
  let bytesPrompt = 0;
  if (routine == null) falla(6, 'no existe docs/ROUTINE.md');
  else {
    if (!/trig_/.test(routine)) falla(6, 'docs/ROUTINE.md no tiene el id trig_ de la Routine');
    const bloque = /^```prompt\n([\s\S]*?)\n```/m.exec(routine);
    if (!bloque) falla(6, 'docs/ROUTINE.md no tiene el bloque ```prompt');
    else {
      const prompt = bloque[1];
      bytesPrompt = Buffer.byteLength(prompt, 'utf8');
      if (bytesPrompt > MAX_PROMPT) falla(6, `el prompt de la Routine pesa ${bytesPrompt} bytes (máximo ${MAX_PROMPT})`);
      if (prompt.includes('%')) falla(6, 'el prompt de la Routine tiene un «%»: las cifras viven en el repo, no en el prompt');
      const num = /\d{3,}/.exec(prompt);
      if (num) falla(6, `el prompt de la Routine tiene un número de 3 o más cifras (${num[0]}): las cifras viven en el repo`);
      for (const m of prompt.matchAll(/`([^`\n]+)`/g)) {
        const ruta = m[1];
        // Sólo lo que parece un archivo relativo del repo (`tools/x.mjs`, `CLAUDE.md`); `origin/master` o
        // una ruta absoluta no se chequean.
        if (!/^[\w.\-/]+$/.test(ruta) || ruta.startsWith('/') || !ruta.split('/').pop().includes('.')) continue;
        if (!existsSync(join(raiz, ruta))) falla(6, `el prompt de la Routine cita \`${ruta}\` y no existe en el repo`);
      }
    }
  }

  // 7. docs/producto.json
  if (!existsSync(join(raiz, 'docs', 'producto.json'))) falla(7, 'no existe docs/producto.json: corré node tools/producto.mjs --medir');

  // 8. tamaño
  const entradasMejoras = entradas(secs.get('Bitácora') || '').length;
  const bytes = statSync(archivoMejoras).size;
  if (entradasMejoras > MAX_ENTRADAS || bytes > MAX_BYTES) falla(8, `rotar la bitácora a BITACORA_ARCHIVO.md (${entradasMejoras} entradas, ${bytes} bytes; máximo ${MAX_ENTRADAS} y ${MAX_BYTES})`);

  for (const f of fallas) console.log(f);
  if (fallas.length) { console.log(`${fallas.length} falla(s).`); process.exit(1); }
  console.log(`OK · ${bit.length} iteración(es) en la bitácora · ${pendientes.length} pendientes en la hoja · prompt de la Routine ${bytesPrompt} bytes · MEJORAS.md ${bytes} bytes`);
}

const modos = args.filter((a) => ['--siguiente', '--check'].includes(a));
const validos = ['--siguiente', '--check', '--en-curso', '--archivo', '--sin-git', '--raiz'];
if (modos.length !== 1 || args.some((a) => a.startsWith('--') && !validos.includes(a))) {
  console.error('uso: node tools/loop.mjs (--siguiente | --check [--en-curso]) [--archivo <ruta>] [--sin-git] [--raiz <dir>]');
  process.exit(2);
}
if (modos[0] === '--siguiente') siguiente();
else check();
