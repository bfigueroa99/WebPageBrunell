# WebPageBrunell: notas para Claude

Página de presentación de **Brunell** (`bfigueroa99/Brunell_Node`): un solo `index.html` en español,
inglés en `assets/js/i18n.js`, escenas en `<canvas>`, sin build, sin dependencias, sin CDN. Se sirve
desde `master` con GitHub Pages. Prosa, comentarios, commits y PR en español con tildes.

## Reglas

- **`MEJORAS.md` manda** sobre el prompt de la Routine y sobre cualquier «Siguiente» anterior: ahí
  están la directiva, cómo se elige cada iteración, la hoja de ruta, los pendientes y la bitácora.
- **Fidelidad:** toda afirmación de la página existe hoy en `origin/dev` de Brunell_Node o está en
  `#roadmap` como no hecha. Las cifras de `#roadmap` las escribe sólo `node tools/producto.mjs
  --aplicar`, nunca a mano. Lo dudoso va a «Pendiente de Benjamin», no a la página.
- **Hosts externos:** sólo los de `HOSTS_PERMITIDOS` en `tools/check.mjs` (hoy Google Fonts).
- **Puerta:** `bash tools/verificar.sh` en verde antes de subir algo (no hay CI; GitHub Actions no
  corre en esta cuenta). Lo nuevo llega con una prueba que falle sin ello.
- **Brunell_Node** (`/home/user/Brunell_Node`) es sólo lectura: `git fetch`, `archive`, `log`,
  `tag`, `diff`, `ls-remote`. Nunca `checkout`, `merge`, `reset`, ni escribir archivos ahí: tiene
  sus propias Routines escribiendo en `dev`.
- **Git:** nunca push directo a `master`, nunca force-push, nunca `git push --delete`. Una rama
  por iteración: `loop/<N>-<slug>`.
- **Routines:** nunca crear ni borrar una; sólo `update_trigger` desde la skill, con el prompt de
  `docs/ROUTINE.md`. Nunca `fire_trigger`.

## Pull requests y merge

El dueño del repositorio autorizó que Claude abra pull requests y los fusione por su cuenta, sin
pedir permiso cada vez:

- Al terminar un cambio verificado, abre el pull request contra `master` desde `loop/<N>-<slug>`,
  con título y descripción en español.
- Fusiónalo con squash, con el título del PR seguido de `(#N)` como en el historial, en cuanto
  `tools/verificar.sh` esté en verde y el PR sin conflictos ni hilos de revisión pendientes. No
  hace falta esperar aprobación.
- Si el usuario pidió revisar antes, o el cambio toca algo que él marcó como delicado, espera a
  que lo diga.
- Los permisos para hacerlo sin confirmaciones están en `.claude/settings.json`.

El loop autónomo sigue `.claude/skills/pagina-loop/SKILL.md`.
