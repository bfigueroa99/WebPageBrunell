# WebPageBrunell

Página de presentación de **Brunell Node**: un sitio cinematográfico, oscuro y de
una sola página que explica el producto sin entrar en detalles técnicos, en
español e inglés y con la paleta de la propia app.

Todo lo que la página presenta como disponible existe hoy en el producto; lo que
todavía está en desarrollo aparece solo en la hoja de ruta.

Las imágenes de cámaras que se ven en la página no son fotos ni videos: son
escenas nocturnas dibujadas en vivo en `<canvas>`, con personas, vehículos y la
capa de detección encima (cuadros, recorridos, zonas y alertas).

## Verla en local

Es un sitio estático, sin dependencias ni build. Cualquier servidor sirve:

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Estructura

```
index.html              contenido en español (texto base) y estructura
assets/css/styles.css   estilos generales (tokens de color al inicio del archivo)
assets/css/sections.css dashboards, reportes y hoja de ruta
assets/js/i18n.js       textos en inglés
assets/js/scene.js      motor de escenas de cámara (hero, monitor, incidentes, mapa de calor)
assets/js/main.js       interacción: idioma, intro, scroll, pestañas, gráficos, contadores
assets/favicon.svg      ícono
```

## Secciones

1. **Hero** — cámara en vivo con detección y titular.
2. **Manifiesto** — texto que se ilumina al hacer scroll.
3. **Cómo funciona** — Conecta → Entiende → Avisa, fijado en pantalla mientras se recorre.
4. **Incidentes** — merodeo, movimiento súbito, posible caída y altercado, cada uno simulado.
5. **Dashboards y reportes** — una ventana tipo app con las vistas reales (Dashboard,
   Detalle, Incidentes, Reportes) y los tipos de reporte, formatos y envíos programados.
6. **Capacidades** — mapa de calor, multicámara, seguimiento, reglas de alerta, accesos,
   celular, alarma silenciosa y clips para compartir.
7. **Privacidad** — todo ocurre en el equipo propio, sin nube.
8. **Cifras y prueba sin cámaras.**
9. **Hoja de ruta** — lo logrado, lo que está en curso y lo que viene.
10. **Preguntas frecuentes y llamado final.**

## Idiomas

El español está escrito en `index.html`; el inglés, en `assets/js/i18n.js` (cada
clave corresponde a un `data-i18n` del HTML). El idioma inicial sale de `?lang=es`
o `?lang=en` en la URL, si no de la última elección del visitante y, si no, del
idioma del navegador. Para compartir la versión en inglés: `…/?lang=en`.

## Paleta

Tomada del CSS de la app Brunell Node: degradado de marca `#667eea → #764ba2`,
texto en degradado `#7c92ee → #a888c8`, fondos carbón `#1a1a1a / #2d2d2d`, verde
`#2ecc71` para estados activos y rojo `#e74c3c / #cf4436` para alertas.

## Antes de publicar

- **Hoja de ruta:** las cifras y etapas son de octubre de 2026 (fuente:
  `docs/ROADMAP.md` y `docs/PLAN_CRECIMIENTO.md` de Brunell_Node). Actualizarlas en
  `index.html`, sección `#roadmap`, y en `assets/js/i18n.js` al cerrar cada etapa.
- **Correo de contacto:** el botón final usa `mailto:` sin destinatario. Cambiarlo
  en `index.html`, sección `#contacto` (hay un comentario justo encima).
- **Fuentes:** se cargan Inter Tight y JetBrains Mono desde Google Fonts. Sin
  conexión, la página usa las fuentes del sistema.

## Publicar en GitHub Pages

En el repositorio: **Settings → Pages → Build and deployment → Deploy from a
branch**, elegir la rama `master` y la carpeta `/ (root)`.

## Accesibilidad y rendimiento

- Con *reducir movimiento* activado en el sistema, la intro se omite y las
  escenas muestran un cuadro fijo (en incidentes, el momento de la alerta).
- Las escenas solo se animan mientras están en pantalla y se pausan con la
  pestaña oculta.
- Navegación por teclado: enlace para saltar al contenido, pestañas con flechas,
  preguntas frecuentes con `<details>` nativo.
