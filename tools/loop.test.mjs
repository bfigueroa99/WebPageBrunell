/* Pruebas de tools/loop.mjs: un MEJORAS.md armado a medida por caso, una copia del repo como
   raíz (para producto --check y docs/ROUTINE.md) y un `gh` falso en el PATH para no salir a
   internet. `node --test tools/` las corre. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const herramienta = join(raiz, 'tools', 'loop.mjs');
const EJES = ['Fidelidad', 'Descubribilidad', 'Contenido', 'Conversión', 'Accesibilidad', 'Rendimiento y privacidad', 'Idiomas'];
const MODO = { 1: 'FIDELIDAD', 2: 'EXPANSIÓN', 3: 'CALIDAD', 0: 'EXPANSIÓN' };

/** Hoja de ruta de `n` ítems alternando ejes; `hechos` = números ya tachados. */
function hojaDe(n, { hechos = [], ejes = ['Descubribilidad', 'Contenido', 'Conversión'], sinPr = [] } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    const eje = ejes[i % ejes.length];
    if (hechos.includes(k)) return `${k}. ~~**Ítem ${k}**~~${sinPr.includes(k) ? '' : ` hecho en #${k}`} · ${eje}.`;
    return `${k}. **Ítem ${k}** · ${eje}. Primera entrega. Comprobar: algo. Evidencia: algo.`;
  }).join('\n');
}

/** Bitácora con las iteraciones `ns` (en orden), cada una con PR y Siguiente salvo que se diga. */
function bitacoraDe(ns, { ejePor = {}, sinSiguiente = [], pendientePr = [] } = {}) {
  return ns.map((n) => [
    `### 2026-10-${String(n).padStart(2, '0')} · Iteración ${n} · ${MODO[n % 4]} · ${ejePor[n] || 'Fidelidad'}`,
    '',
    '- Algo.',
    `- PR: ${pendientePr.includes(n) ? 'pendiente' : `#${n}`}`,
    sinSiguiente.includes(n) ? '- Siguiente: nada' : '- **Siguiente:** lo que toque.',
    '',
  ].join('\n')).join('\n');
}

function mejoras({ hoja = hojaDe(15), calidad = ['Pendiente uno.', 'Pendiente dos.'], bitacora = bitacoraDe([1]), secciones = null, ejes = EJES } = {}) {
  const todas = {
    'Directiva vigente': 'Fiel al producto.',
    'Cómo elige cada iteración': 'N mod 4.',
    'Mapa de alcance': ['| Eje | Hoy | Siguiente |', '| --- | --- | --- |', ...ejes.map((e) => `| ${e} | a | b |`)].join('\n'),
    'Hoja de ruta': hoja,
    'Calidad: pendientes': calidad.map((c) => `- ${c}`).join('\n'),
    'Pendiente de Benjamin': '- Activar Pages.',
    'Cómo validar': '```sh\nbash tools/verificar.sh\n```',
    'Bitácora': bitacora,
  };
  return '# Mejoras\n\n' + Object.entries(todas).filter(([k]) => !secciones || secciones.includes(k)).map(([k, v]) => `## ${k}\n\n${v}\n`).join('\n');
}

/** Raíz de prueba: copia del repo (sin .git) con un MEJORAS.md y un `gh` falso que lista `prs`. */
async function conRaiz(fn, { contenido = mejoras(), prs = [], routine = null } = {}) {
  const base = mkdtempSync(join(os.tmpdir(), 'loop-test-'));
  try {
    const dir = join(base, 'repo');
    mkdirSync(dir);
    for (const f of ['index.html', 'assets', 'tools', 'docs', 'CLAUDE.md', '.claude']) cpSync(join(raiz, f), join(dir, f), { recursive: true });
    writeFileSync(join(dir, 'MEJORAS.md'), contenido);
    if (routine != null) writeFileSync(join(dir, 'docs', 'ROUTINE.md'), routine);
    const bin = join(base, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncat <<'EOF'\n${prs.map((p) => JSON.stringify(p)).join('\n')}\nEOF\n`, { mode: 0o755 });
    const correr = (...a) => {
      const r = spawnSync(process.execPath, [herramienta, ...a, '--raiz', dir, '--sin-git'], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
      return { rc: r.status, out: r.stdout, err: r.stderr };
    };
    await fn({ dir, correr });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

const routineReal = readFileSync(join(raiz, 'docs', 'ROUTINE.md'), 'utf8');

test('--check pasa con un MEJORAS.md completo y el ROUTINE.md del repo', async () => {
  await conRaiz(({ correr }) => {
    const r = correr('--check');
    assert.equal(r.rc, 0, r.out + r.err);
    assert.match(r.out, /^OK · 1 iteración\(es\) en la bitácora · 15 pendientes en la hoja · prompt de la Routine \d+ bytes/m);
  });
});

test('guarda 1: falta una sección o un eje del Mapa', async () => {
  await conRaiz(({ correr }) => {
    const r = correr('--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /FALLA guarda 1: falta la sección «## Cómo validar»/);
  }, { contenido: mejoras({ secciones: ['Directiva vigente', 'Cómo elige cada iteración', 'Mapa de alcance', 'Hoja de ruta', 'Calidad: pendientes', 'Pendiente de Benjamin', 'Bitácora'] }) });
  await conRaiz(({ correr }) => {
    const r = correr('--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /FALLA guarda 1: el Mapa de alcance no tiene la fila «\| Idiomas \|»/);
  }, { contenido: mejoras({ ejes: EJES.slice(0, 6) }) });
});

test('guarda 2: menos de 8 pendientes en la hoja', async () => {
  await conRaiz(({ correr }) => {
    const r = correr('--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /FALLA guarda 2: la hoja de ruta tiene 5 pendientes \(mínimo 8\)/);
  }, { contenido: mejoras({ hoja: hojaDe(5) }) });
});

test('guarda 3: ítem tachado sin «hecho en #n»', async () => {
  await conRaiz(({ correr }) => {
    const r = correr('--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /FALLA guarda 3: ítem 2 «Ítem 2» tachado sin «hecho en #n»/);
  }, { contenido: mejoras({ hoja: hojaDe(12, { hechos: [1, 2], sinPr: [2] }) }) });
});

test('guarda 4: bitácora 1,3 → falta la iteración 2; repetida también falla', async () => {
  await conRaiz(({ correr }) => {
    const r = correr('--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /FALLA guarda 4: falta la iteración 2 en la bitácora/);
  }, { contenido: mejoras({ bitacora: bitacoraDe([1, 3]) }) });
  await conRaiz(({ correr }) => {
    const r = correr('--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /FALLA guarda 4: la iteración 2 está repetida \(2 veces\)/);
  }, { contenido: mejoras({ bitacora: bitacoraDe([1, 2, 2]) }) });
});

test('guarda 5: la última entrada sin Siguiente o sin PR; --en-curso acepta «PR: pendiente»', async () => {
  await conRaiz(({ correr }) => {
    const r = correr('--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /FALLA guarda 5: la iteración 2 no tiene «\*\*Siguiente:\*\*»/);
  }, { contenido: mejoras({ bitacora: bitacoraDe([1, 2], { sinSiguiente: [2] }) }) });
  await conRaiz(({ correr }) => {
    let r = correr('--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /FALLA guarda 5: la iteración 2 no tiene «PR: #n» \(dice «PR: pendiente»; --en-curso lo acepta\)/);
    r = correr('--check', '--en-curso');
    assert.equal(r.rc, 0, r.out);
  }, { contenido: mejoras({ bitacora: bitacoraDe([1, 2], { pendientePr: [2] }) }) });
});

test('guarda 6: ROUTINE.md sin trig_, con %, con un número de 3 cifras o con una ruta que no existe', async () => {
  const conPrompt = (p) => routineReal.replace(/^```prompt\n[\s\S]*?\n```/m, '```prompt\n' + p + '\n```');
  await conRaiz(({ correr }) => {
    const r = correr('--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /FALLA guarda 6: el prompt de la Routine cita `tools\/nada\.mjs` y no existe en el repo/);
    assert.doesNotMatch(r.out, /origin\/master/);
  }, { routine: conPrompt('Corré `tools/nada.mjs` y `tools/loop.mjs` desde `origin/master`; el checkout está en /home/user/Brunell_Node.') });
  await conRaiz(({ correr }) => {
    const r = correr('--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /FALLA guarda 6: el prompt de la Routine tiene un «%»/);
    assert.match(r.out, /FALLA guarda 6: el prompt de la Routine tiene un número de 3 o más cifras \(441\)/);
  }, { routine: conPrompt('La página dice 91% y 441 mejoras.') });
  await conRaiz(({ correr }) => {
    const r = correr('--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /FALLA guarda 6: docs\/ROUTINE\.md no tiene el id trig_/);
  }, { routine: routineReal.replace(/trig_[^\n]*/g, 'sin id') });
  await conRaiz(({ correr }) => {
    const r = correr('--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /FALLA guarda 6: el prompt de la Routine pesa \d+ bytes \(máximo 1500\)/);
  }, { routine: conPrompt('x'.repeat(1501)) });
});

test('guarda 7: sin docs/producto.json', async () => {
  await conRaiz(({ dir, correr }) => {
    rmSync(join(dir, 'docs', 'producto.json'));
    const r = correr('--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /FALLA guarda 7: no existe docs\/producto\.json/);
  });
});

test('guarda 8: 13 entradas piden rotar la bitácora', async () => {
  await conRaiz(({ correr }) => {
    const r = correr('--check');
    assert.equal(r.rc, 1);
    assert.match(r.out, /FALLA guarda 8: rotar la bitácora a BITACORA_ARCHIVO\.md \(13 entradas/);
  }, { contenido: mejoras({ bitacora: bitacoraDe(Array.from({ length: 13 }, (_, i) => i + 1)) }) });
});

test('--siguiente: N=1..5 → FIDELIDAD, EXPANSION, CALIDAD, EXPANSION, FIDELIDAD', async () => {
  const esperado = { 1: 'FIDELIDAD', 2: 'EXPANSION', 3: 'CALIDAD', 4: 'EXPANSION', 5: 'FIDELIDAD' };
  for (const N of [1, 2, 3, 4, 5]) {
    const previas = Array.from({ length: N - 1 }, (_, i) => i + 1);
    await conRaiz(({ correr }) => {
      const r = correr('--siguiente');
      assert.equal(r.rc, 0, r.out + r.err);
      assert.match(r.out, new RegExp(`^N=${N} modo=${esperado[N]} `));
      assert.match(r.out, / cifras=ok rama=loop\/\d+-[a-z0-9-]{1,40}$/m);
    }, { contenido: mejoras({ bitacora: previas.length ? bitacoraDe(previas) : '' }) });
  }
});

test('--siguiente en EXPANSIÓN toma el primer pendiente, salvo que repita el eje de la expansión anterior', async () => {
  // N=4: la expansión anterior (2) fue de Descubribilidad y el primer pendiente también: toma el 2 (Contenido).
  await conRaiz(({ correr }) => {
    const r = correr('--siguiente');
    assert.equal(r.rc, 0, r.err);
    assert.match(r.out, /^N=4 modo=EXPANSION eje=Contenido item="Ítem 2" motivo="N mod 4 = 0; el primero \(«Ítem 1»\) repite el eje Descubribilidad de la expansión anterior \(iteración 2\)" cifras=ok rama=loop\/4-item-2$/m);
  }, { contenido: mejoras({ bitacora: bitacoraDe([1, 2, 3], { ejePor: { 2: 'Descubribilidad' } }) }) });
  // N=2: sin expansión anterior, el primero.
  await conRaiz(({ correr }) => {
    const r = correr('--siguiente');
    assert.equal(r.rc, 0, r.err);
    assert.match(r.out, /^N=2 modo=EXPANSION eje=Descubribilidad item="Ítem 1" motivo="N mod 4 = 2; primer pendiente de la Hoja; eje distinto de Fidelidad" cifras=ok rama=loop\/2-item-1$/m);
  });
  // Los tachados no cuentan.
  await conRaiz(({ correr }) => {
    const r = correr('--siguiente');
    assert.match(r.out, /^N=2 modo=EXPANSION eje=Contenido item="Ítem 2"/m);
  }, { contenido: mejoras({ hoja: hojaDe(12, { hechos: [1] }) }) });
});

test('--siguiente en CALIDAD toma el primer pendiente de Calidad; un **Alta** va antes que todo', async () => {
  await conRaiz(({ correr }) => {
    const r = correr('--siguiente');
    assert.match(r.out, /^N=3 modo=CALIDAD eje=Calidad item="Pendiente uno\." motivo="N mod 4 = 3; primer pendiente de Calidad"/m);
  }, { contenido: mejoras({ bitacora: bitacoraDe([1, 2]) }) });
  await conRaiz(({ correr }) => {
    const r = correr('--siguiente');
    assert.match(r.out, /^N=2 modo=CALIDAD eje=Calidad item="la app en blanco\." motivo="pendiente Alta va antes que todo"/m);
  }, { contenido: mejoras({ calidad: ['Pendiente uno.', '**Alta**: la app en blanco.'] }) });
});

test('--siguiente con un PR abierto para N sale 3; sin pendientes en la hoja sale 2', async () => {
  await conRaiz(({ correr }) => {
    const r = correr('--siguiente');
    assert.equal(r.rc, 3);
    assert.match(r.out, /^ya hay PR #9 para la iteración 2: Iteración 2 · EXPANSIÓN: algo$/m);
  }, { prs: [{ number: 8, title: 'Iteración 12 · CALIDAD: otra' }, { number: 9, title: 'Iteración 2 · EXPANSIÓN: algo' }] });
  await conRaiz(({ correr }) => {
    const r = correr('--siguiente');
    assert.equal(r.rc, 2);
    assert.match(r.err, /FALLO: la hoja de ruta no tiene pendientes/);
  }, { contenido: mejoras({ hoja: hojaDe(3, { hechos: [1, 2, 3] }) }) });
});
