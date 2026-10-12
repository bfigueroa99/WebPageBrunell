---
name: pagina-loop
description: Run one fully autonomous iteration of the WebPageBrunell loop — syncs the roadmap figures with Brunell_Node, picks N/mode/item from MEJORAS.md, implements, runs the gate (tools/verificar.sh), logs, opens the PR and squash-merges it. Use to advance the page loop.
---

# Una iteración del loop de la página

Sesión nueva, sin memoria: todo lo que hace falta está en `origin/master`. Las reglas de fondo
(directiva, modos, hoja de ruta, pendientes) están en `MEJORAS.md` y mandan sobre este texto.
Cero preguntas: lo que sea del humano va a «Pendiente de Benjamin» y al informe.

## §0 Arranque

- `git fetch origin master` y `git checkout --detach origin/master`.
- `git ls-remote --heads origin 'loop/*'`: las ramas sin PR abierto van al informe; no se borran
  ni se rescatan (`tools/loop.mjs --siguiente` las esquiva solo).

## §1 Elegir

- `node tools/producto.mjs --medir`. Si sale 2 («sin medir»): seguir con el `docs/producto.json`
  de master, usar `--sin-producto` en cada `verificar.sh` de esta iteración y decirlo en el informe.
- `node tools/loop.mjs --siguiente` → `N`, `modo`, `eje`, `item`, `cifras`, `rama` (si la rama
  determinista ya existía en origin, imprime `-2`, `-3`… y un AVISO).
- Si sale **3** (ya hay PR #k para N): `git fetch origin <rama del PR> && git checkout -B
  <rama del PR> FETCH_HEAD`, `bash tools/verificar.sh --en-curso`. Verde → si la bitácora dice
  `PR: pendiente` (la sesión anterior murió antes de anotarlo), escribir `PR: #k`, tachar el ítem
  `hecho en #k` si falta, `bash tools/verificar.sh --rapido` → `Todo en verde.`, commit, `git push
  origin <rama del PR>`; después `mcp__github__merge_pull_request` squash con `commit_title
  "<título> (#k)"`. Rojo por otra cosa → `mcp__github__add_issue_comment` con el paso que falló y
  `mcp__github__update_pull_request` `state=closed` (la rama queda). Volver a §0.
- Si sale 0: `git checkout -B <rama> origin/master` con la rama que imprimió.
- Si sale 2: no se puede decidir (hoja vacía, archivo mal formado); arreglar eso es la iteración.

## §2 Cifras

`docs/producto.json` refrescado por `--medir` entra **siempre** en este PR, haya o no desvío: es el
«previo» de la próxima FIDELIDAD y la vigencia de 7 días mira el JSON de master. Si
`cifras=desvío` → además `node tools/producto.mjs --aplicar`.

## §3 Hacer el ítem

Según el modo, como dice «## Cómo elige cada iteración» de `MEJORAS.md`:

- **FIDELIDAD:** diff del producto entre el `commit_dev` de master y el nuevo
  (`git -C /home/user/Brunell_Node diff <previo>..origin/dev -- README.md docs/ROADMAP.md`);
  revisar capacidades, incidentes, cifras, etapas (contra `quedan`) y FAQ contra «## Qué hace» del
  README. Cada afirmación revisada deja su fila en la bitácora. Nunca inventar.
- **EXPANSIÓN:** el ítem que dio `--siguiente`, entero, en es y en, con una prueba que falle sin
  él (paso del smoke, caso de `node --test` o guarda de `tools/check.mjs`).
- **CALIDAD:** el primer pendiente de «## Calidad: pendientes»; si no hay, QA activa en Chromium y
  §7.

Presupuesto 90 min; a los 75 se cierra con lo verde. Hasta que existan `loop --huerfanas`,
`producto --diff` y `smoke --capturas`, esos pasos se hacen con los comandos a mano de arriba.

## §4 Puerta

`bash tools/verificar.sh --en-curso` → `Todo en verde.` Si `--medir` salió 2, la puerta es
`bash tools/verificar.sh --en-curso --sin-producto` y el informe lo dice. Si no está en verde, se
arregla o se recorta: nunca se sube en rojo.

## §5 Registrar

En `MEJORAS.md`: entrada `### AAAA-MM-DD · Iteración N · MODO · Eje` en la bitácora con
`- PR: pendiente`, `- Validado: …` y `- **Siguiente:** …`; fila del Mapa de alcance; Hoja de ruta
(reponer a 12 si quedan menos de 8; el ítem hecho se tacha recién en §6, cuando se sabe el número
del PR); Calidad; Pendiente de Benjamin.

## §6 Cerrar

- Commits en español; `git push -u origin loop/<N>-<slug>`. Si origin lo rechaza igual
  (non-fast-forward: la rama ya existía): `git branch -m loop/<N>-<slug>-<HHMM>` y
  `git push -u origin loop/<N>-<slug>-<HHMM>`; el PR se abre desde esa rama.
- `mcp__github__create_pull_request` base `master`, head la rama empujada, título
  `Iteración N · <MODO>: <qué>`, cuerpo en español con la salida de `node tools/producto.mjs
  --json` y la tabla de `verificar.sh`.
- `PR: pendiente` → `PR: #k` en la bitácora; tachar el ítem `~~**Título**~~ hecho en #k · Eje.`;
  `bash tools/verificar.sh --rapido` (sin `--en-curso`; con `--sin-producto` si aplica) →
  `Todo en verde.`; commit; `git push origin <rama>`.
- `mcp__github__merge_pull_request` method `squash`, `commit_title "<título> (#k)"`. Si master
  avanzó: `git merge origin/master`, `bash tools/verificar.sh --rapido`, push, y recién entonces
  fusionar.
- Sin `mcp__github__*`: `gh api repos/bfigueroa99/WebPageBrunell/pulls -X POST -f title=… -f
  head=… -f base=master -f body=…` (y `…/pulls/<k>/merge -X PUT -f merge_method=squash -f
  commit_title=…`). Si tampoco: dejar la rama empujada y decirlo en el informe.

## §7 Sólo en CALIDAD

`mcp__claude-code-remote__get_trigger` con el `trig_` de `docs/ROUTINE.md`; si
`derived_state.prompt` o `cron_expression` difieren del archivo → `update_trigger` con lo del repo.
Nunca `enabled`, nunca borrar, nunca `fire_trigger`.

## §8 Informe (5 líneas)

`N/modo/eje` · `PR #k` · `cifras: commit_dev <sha12>` · `validación: …` · `Para Benjamin: …`
(lo nuevo de esa sección más las ramas `loop/*` sin PR).

## Reglas

- Cero preguntas. Una capacidad por PR. Nunca tocar `/home/user/Brunell_Node` ni `master`
  directo; nunca force-push ni `git push --delete`.
- Si el ítem no cierra en 75 min, se descarta con motivo y se fusiona igual la entrada
  «Iteración N · descartada» (con las cifras, si se aplicaron) para que N avance.
- Nada que el producto no tenga hoy en `origin/dev`. Cifras sólo por `producto.mjs --aplicar`.
