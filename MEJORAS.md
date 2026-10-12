# Mejoras de la página

Directiva, regla de elección, mapa de alcance, hoja de ruta, pendientes y bitácora del loop que
mantiene esta página: una iteración cada 6 h, en una sesión nueva y sin memoria, así que todo lo
que el loop necesita recordar vive en este archivo. Cómo itera está en
`.claude/skills/pagina-loop/SKILL.md`; las herramientas, en `tools/`.

## Directiva vigente

Pedido de Benjamin, 2026-10-12: **la página fiel al producto y con el mayor alcance posible.**

- La fidelidad manda sobre la expansión: antes de sumar algo, lo que la página ya dice tiene que
  ser cierto hoy.
- Nada que el producto no tenga hoy en `origin/dev` de Brunell_Node (checkout en
  `/home/user/Brunell_Node`, sólo lectura): ni precios, ni formularios con terceros, ni idiomas
  que la app no habla (es y en). Lo que está en desarrollo va sólo en `#roadmap`, como no hecho.
- Las cifras de la hoja de ruta las escribe sólo `node tools/producto.mjs --aplicar`, desde el
  panel `scripts/loop_progress.sh` de Brunell_Node (`docs/producto.json`); nunca a mano. A mano
  quedan «3×» (meta M1 del plan: 8 → 24 cámaras), `--now` de la línea de tiempo y la narrativa
  de las etapas.
- Esta sección manda sobre el prompt de la Routine y sobre el **Siguiente** de cualquier entrada
  anterior de la bitácora.

## Cómo elige cada iteración

1. **N** = (la mayor «Iteración k» de la Bitácora de este archivo y de `BITACORA_ARCHIVO.md`,
   leídos de `origin/master`) + 1. Lo que no está fusionado no cuenta. Lo calcula
   `node tools/loop.mjs --siguiente`, que también dice el modo, el ítem y la rama
   `loop/<N>-<slug>`.
2. **Cifras primero.** Toda iteración arranca con `node tools/producto.mjs --medir`; si
   `node tools/producto.mjs --check` da 1, `node tools/producto.mjs --aplicar` entra en el PR de
   esa iteración, sea cual sea su modo: las cifras se corrigen por evento, no por turno.
3. **Modo por `N mod 4`:**
   - **1 → FIDELIDAD.** Revisión narrativa contra el producto: diff del README y del ROADMAP de
     Brunell_Node entre el `commit_dev` de `git show origin/master:docs/producto.json` y el nuevo
     (`git -C /home/user/Brunell_Node diff <previo>..origin/dev -- README.md docs/ROADMAP.md`);
     revisar `#capacidades`, `#incidentes`, `.figures`, los ítems hechos y no hechos de `#roadmap`
     contra `quedan` de cada fase, y la FAQ, contra la tabla «## Qué hace» del README. Cada
     afirmación revisada deja su fila en la bitácora; lo dudoso va a Pendiente de Benjamin.
     Nunca se inventa.
   - **2 y 0 → EXPANSIÓN.** El primer ítem no hecho de la Hoja de ruta, salvo que sea del mismo
     eje que la expansión anterior y haya otro de eje distinto entre los tres primeros: entonces
     ese. Así la página crece a lo ancho y no en un solo frente.
   - **3 → CALIDAD.** El primer pendiente de «Calidad: pendientes»; si no hay, QA activa en
     Chromium (recorrer la página como un visitante y anotar lo roto) y comparar la Routine con
     `docs/ROUTINE.md`.
4. Un pendiente marcado **Alta** va antes que todo, sea cual sea el modo.
5. Una capacidad entera por PR, en español y en inglés, con una prueba que falle sin ella: un
   paso del smoke, un caso de `node --test` o una guarda de `tools/check.mjs`.
6. Presupuesto: 90 min por iteración; a los 75 se cierra con lo que esté en verde. Lo que no cerró
   vuelve a su lista con el motivo, y la bitácora lo dice.
7. Si quedan menos de 8 pendientes en la Hoja de ruta, se repone a 12 con ítems que citen su
   evidencia en `origin/dev` de Brunell_Node.

## Mapa de alcance

Lo que cubre hoy cada eje y lo que viene en la hoja de ruta. Cada iteración pasa lo suyo de la
segunda columna a la primera.

| Eje | Hoy | Siguiente |
| --- | --- | --- |
| Fidelidad | cifras de `#roadmap` desde el panel del producto (`tools/producto.mjs`); revisión narrativa cada cuatro iteraciones | afirmaciones con fuente (`docs/afirmaciones.json`); «Novedades» desde el ROADMAP del producto |
| Descubribilidad | una sola página; `og:title` y `og:description`; `twitter:card` sin imagen | prerender por idioma con canonical, hreflang, sitemap y robots; imagen Open Graph; JSON-LD; `404.html` |
| Contenido | hero, manifiesto, cómo funciona, incidentes, dashboards, capacidades, privacidad, cifras, hoja de ruta y FAQ | capturas reales del producto; capacidades que la página calla; página «Empezar» |
| Conversión | botón de demo por `mailto:` sin destinatario | «Última versión» con enlace a Releases y requisitos |
| Accesibilidad | saltar al contenido, pestañas con flechas, `<details>` nativo, menos movimiento respetado | línea base medida (`smoke --medir`); hoja de estilos de impresión |
| Rendimiento y privacidad | sin dependencias ni CDN; Google Fonts es el único host externo | fuentes autoalojadas; CSP cerrada |
| Idiomas | es en el HTML y en en `i18n.js`, paridad de claves vigilada por `tools/check.mjs` | mecanismo N-ario; pt-BR sólo cuando el producto lo hable |

## Hoja de ruta

Ordenada por alcance ganado frente a esfuerzo. Cada ítem dice su eje, la primera entrega (la mínima
que ya sirve), cómo comprobarla y la evidencia que lo justifica. Hecho = `~~**Título**~~ hecho en
#N · Eje.`

1. **Prerender por idioma** · Descubribilidad. `tools/prerender.mjs` genera `en/index.html`
   aplicando `i18n.js` al HTML (rutas `../assets/`), más `<link rel=canonical>`, `hreflang`
   es/en/x-default, `sitemap.xml` y `robots.txt`; `--check` falla si `en/index.html` no coincide
   con lo generado; URL provisional `https://bfigueroa99.github.io/WebPageBrunell/`. Comprobar: el
   smoke abre `/en/` con JS apagado y lee el título en inglés; `tools/check.mjs` recorre `en/`.
   Evidencia: hoy 0 metadatos SEO (sólo `twitter:card`); el inglés sólo existe vía JS con
   `i18n-pending` de 3 s.
2. **Fuentes autoalojadas** · Rendimiento y privacidad. woff2 de Inter Tight 300-700 y JetBrains
   Mono 400-500 (subconjunto latin) en `assets/fonts/`, `@font-face` con `font-display: swap`, sin
   `preconnect`; `HOSTS_PERMITIDOS = []`. Comprobar: smoke y check con `hosts externos: 0`.
   Evidencia: Google Fonts es hoy el único host externo de una página que vende «nada sale a
   internet».
3. **Imagen Open Graph** · Descubribilidad. `og:image` y `twitter:image` de 1200×630 generada por
   el smoke desde el hero (`--og assets/og.png`). Comprobar: el PNG existe y `tools/check.mjs`
   exige la meta. Evidencia: `twitter:card summary_large_image` sin imagen.
4. **Sección «Así se ve»** · Contenido. Capturas reales
   `docs/images/readme/{dashboard,cameras,incidents,reports}.png` de Brunell_Node copiadas por
   `producto.mjs --imagenes` (sha en `producto.json`), alt bilingüe. Comprobar: `tools/check.mjs`
   (alt) y `--check` del sha. Evidencia: existen en `origin/dev` (capturas contra la app en modo
   demo).
5. **«Última versión» y requisitos** · Conversión. `release` del JSON (hoy v2.8.0) con enlace a
   GitHub Releases; Docker o nativo, GPU opcional, Jetson Orin NX. Comprobar: `producto --check`
   compara el tag. Evidencia: tags v2.4.0…v2.8.0; README «Inicio rápido»; hardware destino del plan
   (2026-10-05).
6. **Capacidades que la página calla** · Contenido. Zonas de conteo, modo demo, alerta de detección
   con imagen, PWA instalable, en `#capacidades` o en la FAQ. Comprobar: cada afirmación con su
   fila de «## Qué hace» en la bitácora. Evidencia: filas del README de `origin/dev`.
7. **`docs/afirmaciones.json` + `producto.mjs --afirmaciones`** · Fidelidad. Cada afirmación de
   capacidades, cifras y FAQ cita una fila de «## Qué hace» o un ID cerrado; falla si la fuente
   desaparece. Comprobar: `--afirmaciones` sale 1 al quitar una fila en una copia. Evidencia: fig2
   «7 tipos» y `share.text` sin fila hoy.
8. **`404.html`** · Descubribilidad. Con la paleta y el menú, bilingüe. Comprobar:
   `tools/check.mjs` la recorre; el smoke la abre. Evidencia: no existe.
9. **JSON-LD `SoftwareApplication` + `meta robots`** · Descubribilidad. Comprobar:
   `tools/check.mjs` valida el JSON. Evidencia: 0 datos estructurados.
10. **«Novedades»** · Contenido. Tres ítems en lenguaje simple desde «## Cerrado hace poco» de
    `docs/ROADMAP.md` del producto, redactados por FIDELIDAD. Comprobar: cada ítem cita su ID.
    Evidencia: sección existente en `origin/dev`.
11. **`smoke --medir` + `docs/linea_base.json`** · Accesibilidad. Peso, img sin alt, targets
    < 44 px, contraste sobre fondo sólido, trinquete direccional. Comprobar: sale 1 si empeora.
    Evidencia: sin línea base hoy.
12. **Hoja de estilos de impresión** · Accesibilidad. Comprobar: smoke con `media: 'print'` sin
    desborde. Evidencia: no existe.
13. **CSP cerrada** por `<meta http-equiv>` · Rendimiento y privacidad. Después del ítem 2.
    Comprobar: smoke sin errores de CSP en consola. Evidencia: no existe.
14. **Portugués (pt-BR)** · Idiomas. Sólo cuando Brunell_Node lo hable (`static/js/i18n.js` de
    `origin/dev`) o Benjamin lo pida; primero el mecanismo N-ario. Evidencia: el producto es es/en.
15. **Página «Empezar»** · Contenido. Desde `docs/00_INICIO_RAPIDO.md` y `docs/QUICKSTART_EN.md`
    del producto. Comprobar: `tools/check.mjs` la recorre. Evidencia: existen en `origin/dev`.

## Calidad: pendientes

Los toma la iteración CALIDAD (una de cada cuatro) y, si son **Alta**, cualquiera. En orden.

- La cabecera se oculta al bajar (`.header.is-hidden`) y tapa el selector de idioma: el smoke
  vuelve arriba antes de clicar; evaluar si el selector debería quedar accesible al subir 1 px.
- `i18n-pending` con timeout de 3 s: si `i18n.js` tarda, destello en español.
- `--now: 58%` de la línea de tiempo sin regla: derivarlo de las fases.
- `runCounter` imprime `1000` sin separador cuando los cerrados pasen de 999 (hoy 901).
- fig2 «7 tipos de comportamiento» sin lista canónica (README: 4 + detección;
  `TIPOS_EVENTO_VALIDOS`: 11): lo decide FIDELIDAD.
- Comprobación «sin traducir» de `tools/check.mjs` como FALLA con excepciones (hoy 6 AVISO
  legítimos).
- `loop --huerfanas` (ramas `loop/*` sin PR), `producto --diff` (diff del README del producto entre
  el `commit_dev` de master y el nuevo) y `smoke --capturas` (3 PNG). Hasta que existan, la skill da
  los comandos a mano.
- `tools/publicado.mjs` (commit_dev publicado contra master) cuando Pages esté activo.
- Rotar la bitácora a `BITACORA_ARCHIVO.md` cuando la guarda 8 de `tools/loop.mjs --check` avise.

## Pendiente de Benjamin

Lo que necesita a un humano. El loop no lo hace: lo anota acá y en su informe.

- Activar GitHub Pages (`has_pages:false`, el sitio responde 404): Settings → Pages → Deploy from
  a branch → `master` / (root).
- Destinatario del `mailto:` (index.html, `#contacto`, el enlace del botón «Solicitar una demo»).
- Dominio / URL canónica (provisional `https://bfigueroa99.github.io/WebPageBrunell/`).
- Encender la Routine `trig_…` de `docs/ROUTINE.md` (nace apagada; encenderla es consentir el
  merge automático).
- «Automatically delete head branches» en el repo (`delete_branch_on_merge:false`).
- «87 % del plan actual» es el % del backlog y baja mientras se siembran ítems (91 → 87 con 460
  cierres más): ¿rotular «del backlog» o quitarlo?
- Afirmaciones sin fila en «Qué hace» del README del producto: fig2 «7 tipos», `share.text`
  «enlace que vence solo».

## Cómo validar

```sh
bash tools/verificar.sh                 # check · test · producto · loop · smoke; termina en «Todo en verde.»
bash tools/verificar.sh --rapido        # lo mismo sin el smoke (< 10 s)
bash tools/verificar.sh --en-curso      # acepta «PR: pendiente» en la última entrada de la bitácora
node tools/check.mjs                    # sintaxis, claves es/en, anclas, ids, alt, rutas y hosts externos
node --test tools/*.test.mjs            # pruebas de las herramientas (tools/*.test.mjs)
node tools/producto.mjs --medir         # panel de Brunell_Node → docs/producto.json (necesita el checkout o red)
node tools/producto.mjs --check         # la página contra docs/producto.json (sin red)
node tools/producto.mjs --aplicar       # corrige los literales de #roadmap e i18n.js
node tools/loop.mjs --siguiente         # N, modo, ítem y rama de la próxima iteración
node tools/loop.mjs --check             # guardas de este archivo, docs/ROUTINE.md y docs/producto.json
node tools/smoke.mjs                    # la página en Chromium: escritorio, celular, menos movimiento, es-CL
```

Códigos de salida de todas las herramientas: 0 ok · 1 desvío · 2 no evaluable (con 2 nunca se
escribe nada). El smoke necesita Playwright con Chromium (`PLAYWRIGHT_CHROMIUM_PATH` elige otro).

## Bitácora

### 2026-10-12 · Iteración 1 · FIDELIDAD · Fidelidad

- **Bootstrap del loop:** `tools/producto.mjs`, `tools/check.mjs`, `tools/smoke.mjs`,
  `tools/loop.mjs`, `tools/verificar.sh` y sus pruebas `node --test`; este archivo; `CLAUDE.md`,
  `.claude/settings.json` y la skill `pagina-loop`; `docs/ROUTINE.md` con el prompt de la Routine
  (nace apagada). Esta iteración corrió en la rama `ccr-665785e4-ya854h` que el harness asignó a la
  sesión; desde la 2, `loop/<N>-<slug>`.
- **Cifras sincronizadas** con `scripts/loop_progress.sh` de Brunell_Node (origin/dev
  9d5b8986a63c): 91 % → 87 %, 441 → 901, «Más de 440» → «Más de 900». La prosa de
  `docs/ROADMAP.md` estaba vieja; la fuente es el panel. Las cuatro etapas (9/9, 5/8, 5/7, 3/5) ya
  coincidían.
- **Se deja igual:** 3× (meta M1 del plan, 8 → 24 cámaras); narrativa de las etapas; «Lectura de
  patentes» en el horizonte (MARKET-5 sigue abierto); «Versiones oficiales publicadas» sin marcar
  (REACH-2 sigue abierto).
- Validado: `bash tools/verificar.sh` (check, test, producto --check, loop --check, smoke con 4
  escenarios).
- PR: pendiente
- **Siguiente:** iteración 2, EXPANSIÓN, ítem 1 (prerender por idioma, Descubribilidad).
