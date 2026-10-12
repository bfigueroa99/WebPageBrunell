/* Pruebas de tools/producto.mjs contra un Brunell_Node de mentira: un repo git con rama dev,
   tags y un panel fijo, clonado para que exista origin/dev. `node --test tools/` las corre. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const herramienta = join(raiz, 'tools', 'producto.mjs');
const FECHA = '2026-03-05T12:00:00Z';
const PANEL = [
  '== Progreso ==',
  '',
  'Backlog: 1234/1500 ítems cerrados (82%) · 266 abiertos',
  'Prioridad alta/crítica abierta: 3',
  '',
  'Avance por fase:',
  'Fase 0 Fundaciones: 6/8 ítems (75%) · 1 histórico(s)',
  '   quedan: A-1, B-2',
  'Fase 1 Escala: 7/7 ítems (100%)',
  'Fase 2 Plataforma: 9/9 ítems (100%)',
  'Fase 3 Distribución: 2/5 ítems (40%)',
  '   quedan: C-3',
  '',
  'Ritmo: 12 iteraciones',
].join('\n');

const envGit = { ...process.env, GIT_AUTHOR_DATE: FECHA, GIT_COMMITTER_DATE: FECHA, GIT_AUTHOR_NAME: 'prueba', GIT_AUTHOR_EMAIL: 'prueba@localhost', GIT_COMMITTER_NAME: 'prueba', GIT_COMMITTER_EMAIL: 'prueba@localhost' };

/** Repo `src` con rama dev, cinco archivos del panel y tags, más un clon `checkout` con origin/dev. */
function productoFalso(base) {
  const src = join(base, 'src');
  mkdirSync(join(src, 'docs'), { recursive: true });
  mkdirSync(join(src, 'scripts'));
  writeFileSync(join(src, 'README.md'), '# Brunell\n\n## Qué hace\n');
  writeFileSync(join(src, 'docs', 'PRODUCT_LOOP.md'), '# loop\n');
  writeFileSync(join(src, 'docs', 'PRODUCT_LOOP_ARCHIVE.md'), '# archivo\n');
  writeFileSync(join(src, 'docs', 'ROADMAP.md'), '# roadmap\n');
  writeFileSync(join(src, 'scripts', 'loop_progress.sh'), `#!/usr/bin/env bash\n[ "$1" = --check ] || exit 1\ncat <<'EOF'\n${PANEL}\nEOF\n`, { mode: 0o755 });
  const g = (...a) => {
    const r = spawnSync('git', ['-C', src, ...a], { encoding: 'utf8', env: envGit });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  g('init', '-q', '-b', 'dev');
  g('add', '.');
  g('commit', '-q', '-m', 'panel');
  g('tag', 'v1.2.3');
  g('tag', 'v1.10.0');
  const sha = g('rev-parse', 'HEAD');
  const checkout = join(base, 'checkout');
  const c = spawnSync('git', ['clone', '-q', src, checkout], { encoding: 'utf8', env: envGit });
  assert.equal(c.status, 0, c.stderr);
  return { checkout, sha };
}

/** Copia del sitio real (index.html + assets) para que --aplicar escriba ahí. */
function sitio(base) {
  const dir = join(base, 'sitio');
  mkdirSync(dir);
  for (const f of ['index.html', 'assets']) cpSync(join(raiz, f), join(dir, f), { recursive: true });
  return dir;
}

const correr = (dir, ...extra) => {
  const r = spawnSync(process.execPath, [herramienta, ...extra, '--raiz', dir], { encoding: 'utf8' });
  return { rc: r.status, out: r.stdout, err: r.stderr };
};

async function conEntorno(fn) {
  const base = mkdtempSync(join(os.tmpdir(), 'producto-test-'));
  try {
    const { checkout, sha } = productoFalso(base);
    await fn({ sitio: sitio(base), checkout, sha });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test('--medir lee el panel, origin/dev y el tag más alto, y escribe docs/producto.json', async () => {
  await conEntorno(({ sitio, checkout, sha }) => {
    const { rc, out, err } = correr(sitio, '--medir', '--brunell', checkout, '--sin-red');
    assert.equal(rc, 0, err);
    assert.match(err, /AVISO: sin red, uso origin\/dev local [0-9a-f]{12}/);
    assert.match(out, /^Backlog: 1234\/1500 ítems cerrados \(82%\) · 266 abiertos$/m);
    assert.match(out, new RegExp(`^origin/dev ${sha.slice(0, 12)} 2026-03-05 · release v1\\.10\\.0$`, 'm'));
    const j = JSON.parse(readFileSync(join(sitio, 'docs', 'producto.json'), 'utf8'));
    assert.deepEqual(j.backlog, { cerrados: 1234, total: 1500, pct: 82, abiertos: 266 });
    assert.deepEqual(j.fases['0'], { nombre: 'Fundaciones', hechos: 6, total: 8, pct: 75, quedan: ['A-1', 'B-2'] });
    assert.deepEqual(j.fases['1'].quedan, []);
    assert.deepEqual(j.fases['3'].quedan, ['C-3']);
    assert.equal(j.release, 'v1.10.0');
    assert.equal(j.commit_dev, sha.slice(0, 12));
    assert.equal(j.fecha_dev, '2026-03-05');
    assert.equal(j.origen, 'checkout');
    assert.ok(Date.now() - Date.parse(j.medido_en) < 60000);
  });
});

test('sin la línea Backlog el panel no se lee: salida 2 y nada escrito', async () => {
  await conEntorno(({ sitio, checkout }) => {
    const { rc, err } = correr(sitio, '--medir', '--brunell', checkout, '--sin-red', '--panel-cmd', "bash scripts/loop_progress.sh --check | grep -v '^Backlog'");
    assert.equal(rc, 2);
    assert.match(err, /FALLO: no pude leer el panel \(falta la línea «Backlog/);
    assert.equal(existsSync(join(sitio, 'docs', 'producto.json')), false);
  });
});

test('sin una fase, o con el panel roto, salida 2', async () => {
  await conEntorno(({ sitio, checkout }) => {
    let r = correr(sitio, '--medir', '--brunell', checkout, '--sin-red', '--panel-cmd', "bash scripts/loop_progress.sh --check | grep -v '^Fase 2'");
    assert.equal(r.rc, 2);
    assert.match(r.err, /FALLO: no pude leer el panel \(falta la Fase 2\)/);
    r = correr(sitio, '--medir', '--brunell', checkout, '--sin-red', '--panel-cmd', 'exit 7');
    assert.equal(r.rc, 2);
    assert.match(r.err, /FALLO: no pude leer el panel \(el panel salió con 7/);
    assert.equal(existsSync(join(sitio, 'docs', 'producto.json')), false);
  });
});

test('sin producto ni red no se mide', async () => {
  await conEntorno(({ sitio }) => {
    const { rc, err } = correr(sitio, '--medir', '--brunell', join(sitio, 'no-existe'), '--sin-red');
    assert.equal(rc, 2);
    assert.match(err, /FALLO: no pude obtener Brunell_Node/);
  });
});

test('--check ve los desvíos, --aplicar los corrige, y repetirlo no cambia nada', async () => {
  await conEntorno(({ sitio, checkout }) => {
    assert.equal(correr(sitio, '--medir', '--brunell', checkout, '--sin-red').rc, 0);
    let r = correr(sitio, '--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /✗ backlog\.pct data-count: la página dice \d+ \(index\.html:\d+\), medido 82/);
    assert.match(r.out, /✗ backlog\.cerrados texto: la página dice \d+ \(index\.html:\d+\), medido 1234/);
    assert.match(r.out, /✗ etapa data-fase=0 es: la página dice 5 de 8 objetivos \(index\.html:\d+\), medido 6 de 8 objetivos/);
    assert.match(r.out, /✗ etapa data-fase=0 en: la página dice 5 of 8 goals \(assets\/js\/i18n\.js:\d+\), medido 6 of 8 goals/);
    assert.match(r.out, /✗ mas-de es: la página dice \d+ \(index\.html:\d+\), medido 1230/);
    assert.match(r.out, /✗ roadmap\.eyebrow es: la página dice Hoja de ruta · \w+ \d{4} \(index\.html:\d+\), medido Hoja de ruta · marzo 2026/);
    assert.match(r.out, /✓ etapa data-fase=2 ← Fase 2 Plataforma: 9 de 9/);

    r = correr(sitio, '--aplicar');
    assert.equal(r.rc, 0, r.out);
    assert.match(r.out, /^aplicado: \d+ cambios$/m);
    assert.doesNotMatch(r.out, /✗/);
    const html = readFileSync(join(sitio, 'index.html'), 'utf8');
    const i18n = readFileSync(join(sitio, 'assets', 'js', 'i18n.js'), 'utf8');
    assert.match(html, /data-count="82" data-suffix="%" data-cifra="backlog\.pct">82%</);
    assert.match(html, /data-count="1234" data-cifra="backlog\.cerrados">1234</);
    assert.match(html, /Más de 1230 mejoras/);
    assert.match(i18n, /More than 1230 improvements/);
    assert.match(html, /<i style="--p: 75%"><\/i><small data-i18n="stage2\.progress">6 de 8 objetivos</);
    assert.match(i18n, /'stage2\.progress': '6 of 8 goals'/);
    assert.match(html, /<i style="--p: 40%"><\/i><small data-i18n="stage4\.progress">2 de 5 objetivos</);
    assert.match(html, /data-i18n="roadmap\.eyebrow">Hoja de ruta · marzo 2026</);
    assert.match(i18n, /'roadmap\.eyebrow': 'Roadmap · March 2026'/);
    // Lo manual no se toca.
    assert.match(html, /data-count="3" data-suffix="×">3×</);
    assert.match(html, /style="--now: 58%"/);
    assert.match(html, /<article class="stage stage--now" data-fase="0"/);
    assert.match(html, /<li class="done" data-i18n="stage2\.i1"/);

    r = correr(sitio, '--aplicar');
    assert.equal(r.rc, 0);
    assert.match(r.out, /^aplicado: 0 cambios$/m);
    assert.equal(correr(sitio, '--check').rc, 0);
    assert.equal(JSON.parse(correr(sitio, '--json').out).backlog.cerrados, 1234);
  });
});

test('«Más de M» es el mayor múltiplo de 10 menor que los cerrados: 901 → 900, 900 → 890, 441 → 440', async () => {
  await conEntorno(({ sitio, checkout }) => {
    for (const [cerrados, esperado] of [[901, 900], [900, 890], [441, 440]]) {
      const r = correr(sitio, '--medir', '--brunell', checkout, '--sin-red', '--panel-cmd', `bash scripts/loop_progress.sh --check | sed 's#^Backlog: 1234/1500#Backlog: ${cerrados}/1500#'`);
      assert.equal(r.rc, 0, r.err);
      assert.equal(correr(sitio, '--aplicar').rc, 0);
      assert.match(readFileSync(join(sitio, 'index.html'), 'utf8'), new RegExp(`Más de ${esperado} mejoras`));
      assert.match(readFileSync(join(sitio, 'assets', 'js', 'i18n.js'), 'utf8'), new RegExp(`More than ${esperado} improvements`));
    }
  });
});

test('un JSON de 8 días obliga a medir de nuevo (salida 2)', async () => {
  await conEntorno(({ sitio, checkout }) => {
    assert.equal(correr(sitio, '--medir', '--brunell', checkout, '--sin-red').rc, 0);
    const ruta = join(sitio, 'docs', 'producto.json');
    const j = JSON.parse(readFileSync(ruta, 'utf8'));
    j.medido_en = new Date(Date.now() - 8 * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    writeFileSync(ruta, JSON.stringify(j, null, 2) + '\n');
    const r = correr(sitio, '--check');
    assert.equal(r.rc, 2);
    assert.match(r.err, /FALLO: corré --medir \(docs\/producto\.json medido hace 8 días\)/);
    rmSync(ruta);
    assert.equal(correr(sitio, '--check').rc, 2);
    assert.equal(correr(sitio, '--aplicar').rc, 2);
  });
});
