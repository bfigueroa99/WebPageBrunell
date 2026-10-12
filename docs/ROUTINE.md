# Routine del loop de la página

- Nombre: WebPageBrunell: iteración de la página cada 6 h
- Cron (UTC): 31 */6 * * *
- Sesión: nueva por disparo (create_new_session_on_fire: true)
- Notificación: push
- Modelo: por defecto
- ID: trig_01RY3ekYUyVDvTt4SbWpZRao
- Estado: creada apagada el 2026-10-12; la enciende Benjamin

Aviso que devolvió la creación: la Routine no guarda conectores MCP, así que las sesiones que
dispara pueden correr sin herramientas `mcp__github__*`. La skill tiene el fallback `gh api` para
abrir y fusionar el PR y, si tampoco, deja la rama empujada y lo dice en el informe.

Este archivo es la fuente de verdad del prompt. La iteración CALIDAD compara la Routine con este
bloque y la corrige con update_trigger. El prompt no incrusta cifras ni reglas a propósito: viven en
`MEJORAS.md` y en la skill, y `node tools/loop.mjs --check` (guarda 6) falla si el bloque pesa más
de 1500 bytes, trae un `%` o un número de 3 cifras, o cita una ruta del repo que no existe.

```prompt
Ejecutá UNA iteración del loop de WebPageBrunell (bfigueroa99/WebPageBrunell), la página de presentación de Brunell. Sesión nueva, sin memoria: todo vive en el repo. Autonomía total: no preguntes; lo que sea del humano va al informe. 1) `git fetch origin master` y arrancá desde `origin/master`; leé `CLAUDE.md`, `MEJORAS.md` y `.claude/skills/pagina-loop/SKILL.md` con `git show origin/master:<ruta>`, no desde tu copia. 2) Seguí la skill entera: `tools/producto.mjs` mide el producto, `tools/loop.mjs` decide N, modo, ítem y rama, `tools/verificar.sh` es la puerta. 3) El checkout del producto es /home/user/Brunell_Node, sólo lectura (si no está, la herramienta lo clona). 4) Nunca push directo a master ni force-push; PR contra master y squash merge cuando la puerta esté verde (autorizado en `CLAUDE.md`). 5) No crees, borres ni modifiques Routines fuera de lo que dice la skill. 6) Terminá con el informe de la skill. Este prompt no incrusta cifras ni reglas a propósito: viven en el repo.
```
