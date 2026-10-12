#!/usr/bin/env bash
# Puerta única del sitio, en orden: check · test · producto · loop · smoke.
#
#   bash tools/verificar.sh [--rapido] [--sin-producto] [--en-curso]
#     --rapido        salta el smoke (queda en menos de 10 s)
#     --sin-producto  no falla si docs/producto.json falta o está viejo (rc 2 de producto --check)
#     --en-curso      loop --check acepta «PR: pendiente» en la última entrada de la bitácora
#
# Cada paso imprime `paso · rc · s`. Termina en «Todo en verde.» (0), «FALLA en <paso> (rc=n)» (1)
# o «NO EVALUABLE: smoke» (2) cuando no hay Playwright o Chromium. No hay CI: esta es la puerta.
set -euo pipefail
cd "$(dirname "$0")/.."

rapido=0; sin_producto=0; en_curso=()
for a in "$@"; do
  case "$a" in
    --rapido) rapido=1 ;;
    --sin-producto) sin_producto=1 ;;
    --en-curso) en_curso=(--en-curso) ;;
    *) echo "uso: bash tools/verificar.sh [--rapido] [--sin-producto] [--en-curso]" >&2; exit 2 ;;
  esac
done

# paso <nombre> <comando…>: corre el comando, imprime la línea de resumen y devuelve su rc.
paso() {
  local nombre=$1 t0=$SECONDS rc=0
  shift
  "$@" || rc=$?
  printf '%s · rc %s · %s s\n' "$nombre" "$rc" "$((SECONDS - t0))"
  return "$rc"
}
falla() { echo "FALLA en $1 (rc=$2)"; exit 1; }

paso check node tools/check.mjs || falla check $?

if ls tools/*.test.mjs >/dev/null 2>&1; then
  paso test node --test --test-reporter=spec tools/*.test.mjs || falla test $?
else
  echo "test · saltado (no hay tools/*.test.mjs)"
fi

rc=0; paso producto node tools/producto.mjs --check || rc=$?
if [ "$rc" -eq 2 ]; then
  echo "AVISO: cifras sin medir (node tools/producto.mjs --medir)"
  [ "$sin_producto" -eq 1 ] || falla producto 2
elif [ "$rc" -ne 0 ]; then
  falla producto "$rc"
fi

paso loop node tools/loop.mjs --check ${en_curso[@]+"${en_curso[@]}"} || falla loop $?

if [ "$rapido" -eq 1 ]; then
  echo "smoke · saltado (--rapido)"
else
  rc=0; paso smoke node tools/smoke.mjs || rc=$?
  if [ "$rc" -eq 2 ]; then echo "NO EVALUABLE: smoke"; exit 2; fi
  [ "$rc" -eq 0 ] || falla smoke "$rc"
fi

echo "Todo en verde."
