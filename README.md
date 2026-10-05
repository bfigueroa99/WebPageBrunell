# WebPageBrunell

Página de presentación de **Brunell Node**: un sitio cinematográfico, oscuro y de
una sola página que explica el producto sin entrar en detalles técnicos.

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
index.html            contenido y estructura de la página
assets/css/styles.css estilos (tokens de color al inicio del archivo)
assets/js/scene.js    motor de escenas de cámara (hero, monitor, incidentes, mapa de calor)
assets/js/main.js     interacción: intro, scroll, pestañas, contadores, cursor
assets/favicon.svg    ícono
```

## Secciones

1. **Hero** — cámara en vivo con detección y titular.
2. **Manifiesto** — texto que se ilumina al hacer scroll.
3. **Cómo funciona** — Conecta → Entiende → Avisa, fijado en pantalla mientras se recorre.
4. **Incidentes** — merodeo, movimiento súbito, posible caída y altercado, cada uno simulado.
5. **Capacidades** — mapa de calor, búsqueda, reportes, sonido, accesos, celular, alarma silenciosa, clips.
6. **Privacidad** — todo ocurre en el equipo propio, sin nube.
7. **Cifras, prueba, preguntas frecuentes y llamado final.**

## Antes de publicar

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
