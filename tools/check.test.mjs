/* Pruebas de tools/check.mjs: cada caso rompe una copia del sitio y espera la FALLA que
   corresponde. `node --test tools/` las corre. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const herramienta = join(raiz, 'tools', 'check.mjs');

/** Copia del sitio (index.html + assets) en un temporal; `fn` recibe la ruta y la limpia al final. */
async function conCopia(fn) {
  const dir = mkdtempSync(join(os.tmpdir(), 'check-'));
  try {
    for (const f of ['index.html', 'assets']) cpSync(join(raiz, f), join(dir, f), { recursive: true });
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const correr = (dir) => {
  const r = spawnSync(process.execPath, [herramienta, '--raiz', dir], { encoding: 'utf8' });
  return { rc: r.status, out: r.stdout + r.stderr };
};
const editar = (ruta, de, a) => {
  const s = readFileSync(ruta, 'utf8');
  assert.ok(s.includes(de), `la copia no contiene «${de}»`);
  writeFileSync(ruta, s.replace(de, a));
};

test('el sitio real pasa con hosts externos permitidos', async () => {
  await conCopia((dir) => {
    const { rc, out } = correr(dir);
    assert.equal(rc, 0, out);
    assert.match(out, /^OK · 1 html · \d+ claves usadas \+ \d+ por JS · en: \d+ · 0 huérfanas · 0 anclas rotas · 0 ids duplicados · hosts externos: 2$/m);
    assert.doesNotMatch(out, /^FALLA/m);
  });
});

test('una clave renombrada en en: sin texto en el HTML y huérfana en i18n.js', async () => {
  await conCopia((dir) => {
    editar(join(dir, 'assets/js/i18n.js'), "'nav.faq'", "'nav.faqx'");
    const { rc, out } = correr(dir);
    assert.equal(rc, 1);
    assert.match(out, /FALLA index\.html:\d+ clave nav\.faq sin texto en en/);
    assert.match(out, /FALLA assets\/js\/i18n\.js:\d+ clave en huérfana nav\.faqx/);
  });
});

test('id duplicado, img sin alt y ruta local inexistente', async () => {
  await conCopia((dir) => {
    editar(join(dir, 'index.html'), '<main id="contenido">', '<main id="contenido"><img src="assets/nada.svg"><p id="contenido"></p>');
    const { rc, out } = correr(dir);
    assert.equal(rc, 1);
    assert.match(out, /FALLA index\.html:\d+ id="contenido" duplicado/);
    assert.match(out, /FALLA index\.html:\d+ <img> sin alt/);
    assert.match(out, /FALLA index\.html:\d+ src="assets\/nada\.svg" no existe/);
  });
});

test('ancla sin destino', async () => {
  await conCopia((dir) => {
    editar(join(dir, 'index.html'), 'id="roadmap"', 'id="roadmapx"');
    const { rc, out } = correr(dir);
    assert.equal(rc, 1);
    assert.match(out, /FALLA index\.html:\d+ href="#roadmap" sin id="roadmap"/);
    assert.match(out, /^2 falla\(s\)\.$/m);   // el enlace del menú y el del pie
  });
});

test('un script de CDN es un host externo no permitido', async () => {
  await conCopia((dir) => {
    editar(join(dir, 'index.html'), '</head>', '<script src="https://cdn.example.com/x.js"></script></head>');
    const { rc, out } = correr(dir);
    assert.equal(rc, 1);
    assert.match(out, /FALLA index\.html:\d+ host externo cdn\.example\.com en <script src>/);
  });
});

test('un <br> de más en en y un valor vacío', async () => {
  await conCopia((dir) => {
    editar(join(dir, 'assets/js/i18n.js'), "'nav.how': 'How it works'", "'nav.how': 'How<br>it works'");
    editar(join(dir, 'assets/js/i18n.js'), "'nav.privacy': 'Privacy'", "'nav.privacy': ''");
    const { rc, out } = correr(dir);
    assert.equal(rc, 1);
    assert.match(out, /FALLA index\.html:\d+ clave nav\.how: 0 <br> en es y 1 en en/);
    assert.match(out, /FALLA index\.html:\d+ clave nav\.privacy: el valor en en está vacío/);
  });
});

test('un host externo en url() del CSS', async () => {
  await conCopia((dir) => {
    writeFileSync(join(dir, 'assets/css/styles.css'), readFileSync(join(dir, 'assets/css/styles.css'), 'utf8') + '\n.x{background:url(https://cdn.example.com/f.png)}\n');
    const { rc, out } = correr(dir);
    assert.equal(rc, 1);
    assert.match(out, /FALLA assets\/css\/styles\.css:\d+ host externo cdn\.example\.com en url\(\)/);
  });
});

test('i18n.js que no evalúa es no evaluable (2)', async () => {
  await conCopia((dir) => {
    writeFileSync(join(dir, 'assets/js/i18n.js'), 'window.BrunellI18n = { en: (function () { throw new Error("roto"); })() };\n');
    const { rc, out } = correr(dir);
    assert.equal(rc, 2);
    assert.match(out, /FALLA assets\/js\/i18n\.js no evalúa: roto/);
  });
});

test('un JS con error de sintaxis falla antes de todo', async () => {
  await conCopia((dir) => {
    writeFileSync(join(dir, 'assets/js/main.js'), 'function (\n');
    const { rc, out } = correr(dir);
    assert.equal(rc, 1);
    assert.match(out, /FALLA assets\/js\/main\.js no pasa node --check/);
  });
});
