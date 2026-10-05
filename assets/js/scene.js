/*
 * Brunell Node — escenas animadas tipo cámara de seguridad.
 *
 * Todo se dibuja en canvas: no hay video ni imágenes externas. Cada escena es
 * una vista nocturna con perspectiva real (cámara a ~3 m de altura), personas,
 * vehículos y la capa de análisis encima (cuadros, recorridos, zonas, alertas).
 *
 * Unidades del mundo: x lateral y alturas en "alturas de persona" (1 = ~1,75 m);
 * z es la profundidad del piso, 0 al frente y 1 al fondo.
 *
 * API pública: BrunellScene.create(canvas, opciones) → escena con
 *   .set(opciones), .setScenario(nombre), .script (guion activo)
 */
(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const DEPTH = 6;          // z=1 está 7 veces más lejos que z=0
  const CAM_H = 1.7;        // altura de la cámara, en alturas de persona
  const Z_UNIT = 19;        // una unidad de z equivale a ~19 alturas de persona
  const SIGNAL = [46, 204, 113];   // personas: el verde con que el producto marca personas y estados activos
  const VEHICLE = [124, 146, 238]; // vehículos: azul (#7c92ee, el índigo claro de la marca)
  const ZONE = [134, 153, 238];    // zonas: índigo de marca
  const ALERT = [231, 76, 60];     // #e74c3c, rojo de alerta de la app
  const ALERT_LABEL = [207, 68, 54]; // #cf4436, fondo rojo para texto blanco (AA)
  const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

  const reduceMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const pad = (n) => String(n).padStart(2, '0');
  const mmss = (s) => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;

  // Textos dibujados en las escenas, por idioma. Cada incidente es [etiqueta, estado].
  const STR = {
    es: {
      person: 'PERSONA', vehicle: 'VEHÍCULO', veh: 'VEH', playback: 'REPRODUCCIÓN', watching: 'Observando',
      zones: { access: 'ZONA A · ACCESO', inventory: 'ZONA B · INVENTARIO', exitC: 'ZONA C · SALIDA', exitD: 'ZONA D · SALIDA', restricted: 'ZONA RESTRINGIDA' },
      loiter: ['MERODEO', 'Alerta · Merodeo en zona restringida'],
      sudden: ['MOVIMIENTO SÚBITO', 'Alerta · Movimiento súbito'],
      fall: ['POSIBLE CAÍDA', 'Alerta · Posible caída'],
      fight: ['ALTERCADO', 'Alerta · Altercado entre dos personas'],
    },
    en: {
      person: 'PERSON', vehicle: 'VEHICLE', veh: 'VEH', playback: 'PLAYBACK', watching: 'Monitoring',
      zones: { access: 'ZONE A · ENTRANCE', inventory: 'ZONE B · INVENTORY', exitC: 'ZONE C · EXIT', exitD: 'ZONE D · EXIT', restricted: 'RESTRICTED ZONE' },
      loiter: ['LOITERING', 'Alert · Loitering in a restricted zone'],
      sudden: ['SUDDEN MOVEMENT', 'Alert · Sudden movement'],
      fall: ['POSSIBLE FALL', 'Alert · Possible fall'],
      fight: ['ALTERCATION', 'Alert · Altercation between two people'],
    },
  };
  let lang = document.documentElement.lang === 'en' ? 'en' : 'es';
  const str = () => STR[lang];

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function quad(g, a, b, c, d, fill, stroke) {
    g.beginPath();
    g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  }

  /* ------------------------------------------------------------------ */
  /* Texturas compartidas: ruido de película, líneas de barrido, calor   */
  /* ------------------------------------------------------------------ */

  const tex = {};
  function textures() {
    if (tex.ready) return tex;
    tex.noise = [];
    for (let n = 0; n < 4; n++) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const img = g.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = Math.random() * 60;
      }
      g.putImageData(img, 0, 0);
      tex.noise.push(c);
    }
    const s = document.createElement('canvas');
    s.width = 2; s.height = 3;
    const sg = s.getContext('2d');
    sg.fillStyle = 'rgba(0,0,0,0.28)';
    sg.fillRect(0, 0, 2, 1);
    tex.scan = s;

    const HEAT = [[70, 80, 190], [102, 126, 234], [80, 190, 230], [235, 240, 110], [255, 180, 70], [255, 110, 55], [231, 76, 60]];
    tex.heat = HEAT.map((c) => {
      const h = document.createElement('canvas');
      h.width = h.height = 64;
      const g = h.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(c, 1));
      gr.addColorStop(0.45, rgba(c, 0.45));
      gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return h;
    });
    tex.ready = true;
    return tex;
  }

  /* ------------------------------------------------------------------ */
  /* Escenarios fijos (arquitectura que se dibuja una vez por tamaño)   */
  /* ------------------------------------------------------------------ */

  const STYLE = {
    wall: { front: '#111113', side: '#0e0e10', top: '#161618', line: 'rgba(200,204,225,0.10)' },
    shelf: { front: '#141416', side: '#111113', top: '#1a1a1d', line: 'rgba(200,204,225,0.13)' },
    car: { front: '#19191c', side: '#141416', top: '#202024', line: 'rgba(205,210,230,0.16)' },
  };

  const LAYOUTS = {
    plaza: {
      horizon: 0.36, sky: '#09090a', floorFar: '#0e0e10', floorNear: '#141416',
      lamp: [255, 176, 100],
      lamps: [[-4.2, 0.24], [5.2, 0.55]],
      hot: [[0, 0.95], [-9, 0.3], [9, 0.36], [-6.5, 0.72], [7, 0.78], [-2.6, 0.07], [3.1, 0.1], [-1.2, 0.45], [1.6, 0.5], [-13, 0.9], [13, 0.88]],
      zone: { key: 'access', x: [-1.7, 1.7], z: [0.8, 0.98] },
      build: 'plaza',
    },
    bodega: {
      horizon: 0.3, sky: '#0a0a0b', floorFar: '#0f0f11', floorNear: '#161618',
      lamp: [220, 228, 255],
      hot: [[0, 0.04], [0, 0.68], [-0.9, 0.3], [1, 0.22], [-0.8, 0.55], [0.9, 0.62], [0, 0.4]],
      suspect: [1.05, 0.2],
      zone: { key: 'inventory', x: [0.2, 1.5], z: [0.14, 0.27] },
      build: 'bodega',
    },
    estacionamiento: {
      horizon: 0.33, sky: '#09090b', floorFar: '#0e0e10', floorNear: '#141416',
      lamp: [200, 225, 255],
      lamps: [[-5, 0.55], [1, 0.58], [6.5, 0.55]],
      hot: [[-9, 0.28], [9, 0.28], [-3, 0.27], [2, 0.29], [0, 0.06], [-4.5, 0.47], [4, 0.46], [-1, 0.3]],
      zone: { key: 'exitC', x: [-1.2, 1.2], z: [0.21, 0.34] },
      cars: { z: 0.28, speed: 3.2 },
      build: 'estacionamiento',
    },
    pasillo: {
      horizon: 0.45, sky: '#0b0b0c', floorFar: '#111113', floorNear: '#18181a',
      lamp: [225, 230, 255],
      hot: [[0, 0.02], [0, 0.78], [-1.3, 0.3], [1.3, 0.45], [-1.2, 0.66], [1.2, 0.15], [0, 0.4]],
      zone: { key: 'exitD', x: [-0.9, 0.9], z: [0.62, 0.79] },
      build: 'pasillo',
    },
    patio: {
      horizon: 0.34, sky: '#09090a', floorFar: '#0e0e10', floorNear: '#151517',
      lamp: [255, 180, 105],
      lamps: [[-5.6, 0.2], [5.6, 0.55]],
      hot: [[0, 0.3]],
      build: 'patio',
    },
  };

  /* ------------------------------------------------------------------ */
  /* Guiones de incidentes (tiempo en segundos, posiciones en el mundo)  */
  /* ------------------------------------------------------------------ */

  const SCRIPTS = {
    loiter: {
      T: 12, speedup: 40,
      zone: { key: 'restricted', x: [0.3, 2.9], z: [0.15, 0.27] },
      actors: [
        { id: 214, keys: [[0, 5.8, 0.22], [3.6, 1.6, 0.2], [12, 1.6, 0.2]], dwell: true },
        { id: 215, keys: [[0.5, -5.8, 0.11], [9, 5.8, 0.12], [12, 5.8, 0.12]] },
        { id: 216, keys: [[0, -9.5, 0.5], [12, 0.5, 0.52]] },
      ],
      alert: { at: 6, who: [0] },
    },
    sudden: {
      T: 10,
      actors: [
        { id: 302, keys: [[0, -5.8, 0.2], [3.8, -1.6, 0.2], [4.9, 2.6, 0.17], [5.6, 3.1, 0.17], [10, 3.15, 0.17]] },
        { id: 303, keys: [[0, 6.8, 0.4], [10, -2, 0.42]] },
      ],
      alert: { at: 4.2, who: [0] },
    },
    fall: {
      T: 11,
      actors: [
        { id: 418, keys: [[0, -5.8, 0.18], [4, -0.6, 0.18], [11, -0.6, 0.18]], fallAt: 4 },
        { id: 419, keys: [[0, 9.6, 0.5], [11, -1, 0.52]] },
      ],
      alert: { at: 5.3, who: [0] },
    },
    fight: {
      T: 11,
      actors: [
        { id: 521, keys: [[0, -5.8, 0.2], [3.4, -0.42, 0.2], [11, -0.42, 0.2]], fightAt: 3.5, face: 1 },
        { id: 522, keys: [[0, 5.8, 0.21], [3.4, 0.42, 0.21], [11, 0.42, 0.21]], fightAt: 3.5, face: -1 },
        { id: 523, keys: [[0, 9.6, 0.55], [5, 4, 0.55], [11, 4, 0.55]] },
      ],
      alert: { at: 4.8, who: [0, 1], group: true },
    },
  };

  function keyAt(keys, t) {
    if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t < b[0]) {
        const u = (t - a[0]) / (b[0] - a[0]);
        return [lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
      }
    }
    const l = keys[keys.length - 1];
    return [l[1], l[2]];
  }

  /* ------------------------------------------------------------------ */
  /* Actores                                                             */
  /* ------------------------------------------------------------------ */

  class Walker {
    constructor(scene, rnd, id, suspect) {
      this.s = scene; this.rnd = rnd; this.id = id; this.suspect = suspect;
      const hot = scene.hot;
      const p = suspect ? scene.L.suspect : hot[(rnd() * hot.length) | 0];
      this.x = p[0] + (rnd() - 0.5) * 2;
      this.z = clamp(p[1] + (rnd() - 0.5) * 0.1, 0.03, 1);
      this.speed = suspect ? 0.35 : 0.75 + rnd() * 0.4;
      this.phase = rnd() * TAU;
      this.move = 0;
      this.idle = rnd() * 2;
      this.conf = 0.86 + rnd() * 0.11;
      this.confT = 0;
      this.trail = [];
      this.trailT = 0;
      this.pickTarget();
    }
    pickTarget() {
      const r = this.rnd;
      if (this.suspect) {
        const a = this.s.L.suspect;
        this.tx = a[0] + (r() - 0.5) * 0.9;
        this.tz = a[1] + (r() - 0.5) * 0.02;
        return;
      }
      const hot = this.s.hot;
      const p = hot[(r() * hot.length) | 0];
      this.tx = p[0] + (r() - 0.5) * 1.4;
      this.tz = clamp(p[1] + (r() - 0.5) * 0.06, 0.02, 1.05);
    }
    update(dt) {
      this.confT -= dt;
      if (this.confT <= 0) { this.conf = clamp(this.conf + (this.rnd() - 0.5) * 0.04, 0.82, 0.98); this.confT = 0.6; }
      if (this.idle > 0) {
        this.idle -= dt;
        this.move = Math.max(0, this.move - dt * 4);
      } else {
        const dx = this.tx - this.x, dz = (this.tz - this.z) * Z_UNIT;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.05) {
          this.pickTarget();
          if (this.suspect) this.idle = 1.5 + this.rnd() * 3;
          else if (this.rnd() < 0.3) this.idle = 0.8 + this.rnd() * 2.4;
        } else {
          const step = Math.min(dist, this.speed * dt);
          this.x += (dx / dist) * step;
          this.z += ((dz / dist) * step) / Z_UNIT;
          this.phase += step * 8.3;
          this.move = Math.min(1, this.move + dt * 4);
        }
      }
      this.trailT -= dt;
      if (this.trailT <= 0 && this.move > 0.3) {
        this.trail.push([this.x, this.z]);
        if (this.trail.length > 22) this.trail.shift();
        this.trailT = 0.16;
      }
    }
  }

  class Car {
    constructor(scene, rnd, lane, id) {
      this.s = scene; this.rnd = rnd; this.lane = lane; this.id = id;
      this.reset(true);
    }
    reset(initial) {
      const r = this.rnd;
      this.dir = r() < 0.5 ? 1 : -1;
      const edge = 2.9 * (1 + DEPTH * this.lane.z) + 4;
      this.x = -this.dir * edge;
      this.end = this.dir * edge;
      this.z = this.lane.z + (this.dir > 0 ? 0.018 : -0.018);
      this.wait = initial ? r() * 3 : 2 + r() * 6;
      this.speed = this.lane.speed * (0.85 + r() * 0.35);
      this.conf = 0.86 + r() * 0.1;
    }
    update(dt) {
      if (this.wait > 0) { this.wait -= dt; return; }
      this.x += this.dir * this.speed * dt;
      if (this.dir * (this.x - this.end) > 0) this.reset(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Escena                                                              */
  /* ------------------------------------------------------------------ */

  const scenes = [];
  let running = false;

  const io = 'IntersectionObserver' in global
    ? new IntersectionObserver((entries) => {
        entries.forEach((e) => { const s = e.target.__scene; if (s) s.visible = e.isIntersecting; });
        kick();
      }, { rootMargin: '150px 0px' })
    : null;

  const ro = 'ResizeObserver' in global
    ? new ResizeObserver((entries) => entries.forEach((e) => { const s = e.target.__scene; if (s) s.resize(); }))
    : null;

  function kick() {
    if (running || reduceMotion) return;
    running = true;
    requestAnimationFrame(loop);
  }

  function loop(now) {
    let any = false;
    for (const s of scenes) {
      if (s.visible && !document.hidden) { any = true; s.tick(now); } else { s.last = 0; }
    }
    if (any) requestAnimationFrame(loop); else running = false;
  }
  document.addEventListener('visibilitychange', kick);
  global.addEventListener('resize', () => { if (!ro) scenes.forEach((s) => s.resize()); });

  class Scene {
    constructor(canvas, opts) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.o = Object.assign({
        layout: 'plaza', seed: 1, walkers: 4, cars: false, zone: false, heat: false,
        overlays: true, alert: false, suspect: false, timestamp: false, fps: 30, maxDpr: 1.5, focusX: 0.5,
        mode: 'ambient', scenario: 'loiter', onCount: null, onStatus: null, onFrame: null, onLoop: null,
      }, opts);
      this.L = LAYOUTS[this.o.layout] || LAYOUTS.plaza;
      this.hot = this.o.hot || this.L.hot;   // puntos a los que caminan las personas
      this.bg = document.createElement('canvas');
      this.flash = 0;
      this.countT = 0;
      this.last = 0;
      this.visible = !io;
      this.W = this.H = 0;
      textures();

      if (this.o.mode === 'incident') {
        this.L = LAYOUTS.patio;
        this.setScenario(this.o.scenario, true);
      } else {
        this.populate();
      }

      canvas.__scene = this;
      scenes.push(this);
      this.resize();
      if (this.o.heat) this.warmup(120);
      else if (!this.script) this.warmup(3);
      if (io) io.observe(canvas);
      if (ro) ro.observe(canvas);
      if (reduceMotion) this.freeze();
      kick();
    }

    populate() {
      const rnd = (this.rnd = rng(this.o.seed * 9973 + 17));
      this.actors = [];
      let id = 100 + ((this.o.seed * 37) % 800);
      for (let i = 0; i < this.o.walkers; i++) this.actors.push(new Walker(this, rnd, id++, false));
      if (this.o.suspect && this.L.suspect) this.actors.push(new Walker(this, rnd, id++, true));
      this.cars = [];
      const lane = this.o.cars === true ? this.L.cars : this.o.cars;
      if (lane) this.cars.push(new Car(this, rnd, lane, 900 + id));
      if (this.o.heat) {
        this.heatGrid = new Float32Array(50 * 26);
        this.heatMax = 1;
      }
    }

    warmup(seconds) {
      for (let t = 0; t < seconds; t += 0.1) this.update(0.1);
      this.draw();
    }

    // Reducción de movimiento: un único cuadro representativo.
    freeze() {
      if (this.script) {
        this.st = 0;
        this.resetScript();
        const until = this.script.alert.at + 1.2;
        while (this.st < until) this.update(1 / 30);
        this.flash = 0;
      }
      this.draw();
    }

    set(opts) {
      const prevAlert = this.o.alert;
      Object.assign(this.o, opts);
      if (this.o.alert && !prevAlert) this.flash = 1;
      if (reduceMotion) { this.flash = 0; this.draw(); }
    }

    setScenario(name, initial) {
      this.scriptName = SCRIPTS[name] ? name : 'loiter';
      this.script = SCRIPTS[this.scriptName];
      this.st = 0;
      this.resetScript();
      if (!initial && reduceMotion) this.freeze();
    }

    resetScript() {
      this.fired = false;
      this.flash = 0;
      this.actors = this.script.actors.map((a, i) => {
        const p = keyAt(a.keys, 0);
        return { spec: a, i, id: a.id, x: p[0], z: p[1], rx: p[0], phase: i * 1.7, move: 0, trail: [], trailT: 0, conf: 0.9 + i * 0.02, fall: 0, fight: false };
      });
      this.cars = [];
      this.emitStatus();
    }

    // Avisa a la página si el guion está observando o ya disparó su alerta.
    emitStatus() {
      if (!this.o.onStatus || !this.script) return;
      this.o.onStatus(this.fired ? str()[this.scriptName][1] : str().watching, !!this.fired);
    }

    resize() {
      const w = Math.max(1, Math.round(this.c.clientWidth));
      const h = Math.max(1, Math.round(this.c.clientHeight));
      const dpr = Math.min(global.devicePixelRatio || 1, this.o.maxDpr);
      if (w === this.W && h === this.H && dpr === this.dpr) return;
      this.W = w; this.H = h; this.dpr = dpr;
      this.c.width = Math.round(w * dpr);
      this.c.height = Math.round(h * dpr);
      // Marco virtual 16:9 recortado como object-fit: cover.
      this.VW = Math.max(w, (h * 16) / 9);
      this.VH = Math.max(h, (w * 9) / 16);
      this.ox = (w - this.VW) / 2;
      this.oy = (h - this.VH) / 2;
      // En pantallas anchas el punto de fuga puede correrse (p. ej. para no
      // competir con el titular del hero, que vive a la izquierda).
      this.cx = w / h > 1.2 ? w * this.o.focusX : w / 2;
      this.hy = this.oy + this.VH * this.L.horizon;
      this.range = this.oy + this.VH * 1.04 - this.hy;
      this.f = this.range / CAM_H;
      this.fs = clamp(Math.min(w, h * 1.7) / 95, 8.5, 12);
      this.buildBackground();
      const g = this.ctx;
      this.vignette = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.62);
      this.vignette.addColorStop(0, 'rgba(0,0,0,0)');
      this.vignette.addColorStop(1, 'rgba(0,0,0,0.7)');
      this.scanPat = g.createPattern(tex.scan, 'repeat');
      this.noisePat = tex.noise.map((n) => g.createPattern(n, 'repeat'));
      this.draw();
    }

    P(x, y, z) {
      const d = 1 + z * DEPTH;
      return { x: this.cx + (x * this.f) / d, y: this.hy + ((CAM_H - y) * this.f) / d, k: this.f / d };
    }

    /* ---------- fondo estático ---------- */

    buildBackground() {
      const b = this.bg;
      b.width = this.c.width; b.height = this.c.height;
      const g = b.getContext('2d');
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const L = this.L, W = this.W, H = this.H;

      const sky = g.createLinearGradient(0, 0, 0, this.hy);
      sky.addColorStop(0, '#060607');
      sky.addColorStop(1, L.sky);
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      const fl = g.createLinearGradient(0, this.hy, 0, H);
      fl.addColorStop(0, L.floorFar);
      fl.addColorStop(1, L.floorNear);
      g.fillStyle = fl;
      g.fillRect(0, this.hy, W, H - this.hy);

      this.drawGrid(g);
      const r = rng(this.o.seed * 31 + 3);
      this['build_' + L.build](g, r);
    }

    drawGrid(g) {
      g.lineWidth = 1;
      for (let x = -24; x <= 24; x += 1.5) {
        const a = this.P(x, 0, 0), b = this.P(x, 0, 1.4);
        g.strokeStyle = 'rgba(124,146,238,0.05)';
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      for (let z = 0; z <= 1.4; z += 0.05) {
        const a = this.P(-40, 0, z), b = this.P(40, 0, z);
        g.strokeStyle = `rgba(124,146,238,${(0.06 * (1 - z / 1.5)).toFixed(3)})`;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
    }

    pool(g, x, z, radius, color, alpha) {
      const p = this.P(x, 0, z);
      const r = (radius * this.f) / (1 + z * DEPTH);
      g.save();
      g.translate(p.x, p.y);
      g.scale(1, 0.34);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, rgba(color, alpha));
      gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr;
      g.fillRect(-r, -r, r * 2, r * 2);
      g.restore();
    }

    glow(g, x, y, z, radius, color, alpha) {
      const p = this.P(x, y, z);
      const r = radius * p.k;
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gr.addColorStop(0, rgba(color, alpha));
      gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr;
      g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }

    lampPost(g, x, z, h, color) {
      this.pool(g, x, z, 3.2, color, 0.16);
      const a = this.P(x, 0, z), b = this.P(x, h, z);
      g.strokeStyle = 'rgba(120,140,135,0.35)';
      g.lineWidth = Math.max(1, 0.05 * a.k);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      this.glow(g, x, h, z, 1.4, color, 0.35);
      this.glow(g, x, h, z, 0.22, [255, 250, 235], 0.95);
    }

    box(g, x0, x1, z0, z1, h, st) {
      const a = this.P(x0, 0, z0), b = this.P(x1, 0, z0), c = this.P(x1, h, z0), d = this.P(x0, h, z0);
      const e = this.P(x0, 0, z1), f = this.P(x1, 0, z1), gg = this.P(x1, h, z1), k = this.P(x0, h, z1);
      if (x1 < 0) quad(g, b, f, gg, c, st.side, st.line);
      if (x0 > 0) quad(g, a, e, k, d, st.side, st.line);
      if (h < CAM_H) quad(g, d, c, gg, k, st.top, st.line);
      quad(g, a, b, c, d, st.front, st.line);
      return [a, b, c, d, e, f, gg, k];
    }

    facade(g, r, z, height, litRatio, doorX) {
      quad(g, this.P(-30, 0, z), this.P(30, 0, z), this.P(30, height, z), this.P(-30, height, z), '#0f0f11', 'rgba(200,204,225,0.08)');
      for (let col = -12; col <= 12; col++) {
        for (let row = 0; row < 4; row++) {
          const x0 = col * 2.2 - 0.6, y0 = 1.7 + row * 0.95;
          if (y0 + 0.6 > height - 0.3) continue;
          const lit = r() < litRatio;
          const warm = r() < 0.75;
          quad(g, this.P(x0, y0, z), this.P(x0 + 1.2, y0, z), this.P(x0 + 1.2, y0 + 0.6, z), this.P(x0, y0 + 0.6, z),
            lit ? (warm ? `rgba(255,190,120,${(0.1 + r() * 0.2).toFixed(2)})` : `rgba(180,220,255,${(0.08 + r() * 0.14).toFixed(2)})`) : 'rgba(180,184,200,0.035)',
            'rgba(200,204,225,0.06)');
        }
      }
      // Puerta iluminada y su luz derramada sobre el piso.
      this.pool(g, doorX, z, 3, [215, 222, 255], 0.2);
      const d0 = this.P(doorX - 1, 0, z), d1 = this.P(doorX + 1, 0, z), d2 = this.P(doorX + 1, 1.45, z), d3 = this.P(doorX - 1, 1.45, z);
      const dg = g.createLinearGradient(0, d3.y, 0, d0.y);
      dg.addColorStop(0, 'rgba(222,228,255,0.55)');
      dg.addColorStop(1, 'rgba(170,182,240,0.25)');
      quad(g, d0, d1, d2, d3, dg, 'rgba(230,235,255,0.4)');
      quad(g, this.P(doorX - 1.5, 1.55, z), this.P(doorX + 1.5, 1.55, z), this.P(doorX + 1.5, 1.68, z), this.P(doorX - 1.5, 1.68, z), 'rgba(124,146,238,0.5)');
    }

    build_plaza(g, r) {
      const L = this.L;
      this.facade(g, r, 1.25, 6.2, 0.3, 0);
      this.box(g, -8, -6.4, 0.6, 0.66, 0.5, STYLE.wall);
      this.box(g, 6.4, 8, 0.66, 0.72, 0.5, STYLE.wall);
      this.box(g, -6.2, -4.9, 0.12, 0.16, 0.45, STYLE.wall);
      L.lamps.forEach(([x, z]) => this.lampPost(g, x, z, 3.1, L.lamp));
    }

    build_patio(g, r) {
      const L = this.L;
      this.facade(g, r, 0.9, 5.2, 0.22, -3.5);
      this.box(g, 3.4, 5, 0.06, 0.085, 0.42, STYLE.wall);
      this.box(g, -6.4, -5, 0.3, 0.36, 0.55, STYLE.wall);
      this.box(g, 4.4, 5.8, 0.45, 0.51, 0.55, STYLE.wall);
      L.lamps.forEach(([x, z]) => this.lampPost(g, x, z, 3.2, L.lamp));
    }

    build_bodega(g, r) {
      const L = this.L;
      const zf = 0.75;
      quad(g, this.P(-12, 0, zf), this.P(12, 0, zf), this.P(12, 4.6, zf), this.P(-12, 4.6, zf), '#101012', 'rgba(200,204,225,0.08)');
      // Portón enrollable con un hilo de luz por debajo.
      const p0 = this.P(-1.8, 0, zf), p1 = this.P(1.8, 0, zf), p2 = this.P(1.8, 2.5, zf), p3 = this.P(-1.8, 2.5, zf);
      quad(g, p0, p1, p2, p3, '#151517', 'rgba(200,204,225,0.16)');
      g.strokeStyle = 'rgba(200,204,225,0.08)';
      for (let y = 0.2; y < 2.5; y += 0.18) {
        const a = this.P(-1.8, y, zf), b = this.P(1.8, y, zf);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      this.pool(g, 0, zf, 2.4, [220, 228, 255], 0.18);
      // Líneas de seguridad del piso.
      g.strokeStyle = 'rgba(235,220,120,0.14)';
      g.lineWidth = 1.2;
      [-1.4, 1.4].forEach((x) => {
        const a = this.P(x, 0, -0.05), b = this.P(x, 0, zf);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      });
      // Luces del techo y su reflejo.
      for (let z = 0.02; z < zf; z += 0.12) this.pool(g, 0, z, 2.2, L.lamp, 0.09);
      // Estanterías, de la más lejana a la más cercana.
      const segs = [[0.48, 0.6], [0.32, 0.44], [0.16, 0.28], [-0.02, 0.12]];
      segs.forEach(([z0, z1]) => {
        [[-4.4, -1.7], [1.7, 4.4]].forEach(([x0, x1]) => {
          this.box(g, x0, x1, z0, z1, 2.6, STYLE.shelf);
          const xi = x1 < 0 ? x1 : x0;
          for (let y = 0.55; y < 2.6; y += 0.6) {
            const a = this.P(xi, y, z0), b = this.P(xi, y, z1);
            g.strokeStyle = 'rgba(200,204,225,0.16)';
            g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
            let z = z0 + 0.005;
            while (z < z1 - 0.02) {
              const len = 0.015 + r() * 0.03;
              if (r() < 0.7) {
                quad(g, this.P(xi, y, z), this.P(xi, y, Math.min(z1, z + len)), this.P(xi, y + 0.35 + r() * 0.1, Math.min(z1, z + len)), this.P(xi, y + 0.35, z),
                  `rgba(${150 + ((r() * 40) | 0)},${150 + ((r() * 30) | 0)},${120 + ((r() * 30) | 0)},0.12)`, 'rgba(0,0,0,0.2)');
              }
              z += len + 0.004;
            }
          }
        });
      });
      for (let z = 0.02; z < zf; z += 0.12) {
        const a = this.P(-0.6, 3.4, z), b = this.P(0.6, 3.4, z);
        g.strokeStyle = 'rgba(235,238,255,0.75)';
        g.lineWidth = Math.max(1, 0.06 * a.k);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        this.glow(g, 0, 3.4, z, 1.2, L.lamp, 0.12);
      }
    }

    build_estacionamiento(g, r) {
      const L = this.L;
      quad(g, this.P(-40, 0, 0.62), this.P(40, 0, 0.62), this.P(40, 1.2, 0.62), this.P(-40, 1.2, 0.62), '#101012', 'rgba(200,204,225,0.1)');
      // Luces lejanas de la ciudad.
      for (let i = 0; i < 60; i++) {
        const p = this.P(-40 + r() * 80, 1.4 + r() * 2.5, 1.6);
        g.fillStyle = `rgba(255,${(180 + r() * 60) | 0},${(120 + r() * 80) | 0},${(0.15 + r() * 0.35).toFixed(2)})`;
        g.fillRect(p.x, p.y, 1.4, 1.4);
      }
      L.lamps.forEach(([x, z]) => this.lampPost(g, x, z, 3.6, L.lamp));
      const rows = [[0.36, 0.5], [0.06, 0.2]];
      rows.forEach(([z0, z1]) => {
        g.strokeStyle = 'rgba(230,232,240,0.2)';
        g.lineWidth = 1.2;
        for (let x = -12; x <= 12; x += 1.5) {
          const a = this.P(x, 0, z0), b = this.P(x, 0, z1);
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        }
        const stalls = [];
        for (let x = -12; x < 12; x += 1.5) if (r() < 0.55) stalls.push(x);
        stalls.sort((a, b) => Math.abs(b + 0.75) - Math.abs(a + 0.75));
        stalls.forEach((x) => {
          this.box(g, x + 0.25, x + 1.25, z0 + 0.012, z1 - 0.02, 0.8, STYLE.car);
          // Parabrisas: franja oscura sobre el techo.
          const w0 = this.P(x + 0.35, 0.8, z0 + 0.03), w1 = this.P(x + 1.15, 0.8, z0 + 0.03);
          const w2 = this.P(x + 1.15, 0.8, z0 + 0.05), w3 = this.P(x + 0.35, 0.8, z0 + 0.05);
          quad(g, w0, w1, w2, w3, 'rgba(0,0,0,0.45)');
        });
      });
    }

    build_pasillo(g, r) {
      const L = this.L;
      const zf = 0.8, X = 2.2, Hh = 3.2;
      quad(g, this.P(-X, Hh, -0.1), this.P(X, Hh, -0.1), this.P(X, Hh, zf), this.P(-X, Hh, zf), '#0b0b0c');
      quad(g, this.P(-X, 0, -0.1), this.P(-X, 0, zf), this.P(-X, Hh, zf), this.P(-X, Hh, -0.1), '#121214', 'rgba(200,204,225,0.08)');
      quad(g, this.P(X, 0, -0.1), this.P(X, 0, zf), this.P(X, Hh, zf), this.P(X, Hh, -0.1), '#121214', 'rgba(200,204,225,0.08)');
      quad(g, this.P(-X, 0, zf), this.P(X, 0, zf), this.P(X, Hh, zf), this.P(-X, Hh, zf), '#161618', 'rgba(200,204,225,0.1)');
      this.pool(g, 0, zf, 1.6, [215, 222, 255], 0.22);
      quad(g, this.P(-0.7, 0, zf), this.P(0.7, 0, zf), this.P(0.7, 1.3, zf), this.P(-0.7, 1.3, zf), 'rgba(210,218,255,0.4)', 'rgba(230,235,255,0.4)');
      quad(g, this.P(-0.35, 1.5, zf), this.P(0.35, 1.5, zf), this.P(0.35, 1.75, zf), this.P(-0.35, 1.75, zf), 'rgba(46,204,113,0.85)');
      this.glow(g, 0, 1.62, zf, 1, SIGNAL, 0.25);
      [[-X, 0.12, 0.2], [-X, 0.42, 0.5], [X, 0.28, 0.36], [X, 0.6, 0.66]].forEach(([x, z0, z1]) => {
        quad(g, this.P(x, 0, z0), this.P(x, 0, z1), this.P(x, 1.3, z1), this.P(x, 1.3, z0), '#0f0f11', 'rgba(200,204,225,0.18)');
      });
      g.strokeStyle = 'rgba(200,204,225,0.12)';
      [-X, X].forEach((x) => {
        const a = this.P(x, 0.06, -0.1), b = this.P(x, 0.06, zf);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      });
      for (let z = 0.04; z < zf; z += 0.14) {
        this.pool(g, 0, z, 2.4, L.lamp, 0.11);
        quad(g, this.P(-0.5, Hh, z), this.P(0.5, Hh, z), this.P(0.5, Hh, z + 0.022), this.P(-0.5, Hh, z + 0.022), 'rgba(238,240,255,0.8)');
        this.glow(g, 0, Hh, z, 1.3, L.lamp, 0.1);
      }
    }

    /* ---------- simulación ---------- */

    update(dt) {
      if (this.script) this.updateScript(dt);
      else {
        for (const a of this.actors) a.update(dt);
        for (const c of this.cars) c.update(dt);
      }
      if (this.heatGrid) this.accumulateHeat(dt);
      this.flash = Math.max(0, this.flash - dt * 1.4);
      if (this.o.onCount) {
        this.countT -= dt;
        if (this.countT <= 0) {
          this.countT = 0.5;
          let n = 0;
          for (const a of this.actors) { const p = this.P(a.x, 0, a.z); if (p.x > 0 && p.x < this.W && p.y < this.H + p.k) n++; }
          for (const c of this.cars) { const p = this.P(c.x, 0, c.z); if (p.x > -p.k && p.x < this.W + p.k) n++; }
          this.o.onCount(n);
        }
      }
    }

    updateScript(dt) {
      const S = this.script;
      this.st += dt;
      if (this.st >= S.T) {
        this.st %= S.T;
        this.resetScript();
        if (this.o.onLoop) this.o.onLoop(this.scriptName);
      }
      const t = this.st;
      for (const a of this.actors) {
        const s = a.spec;
        const p = keyAt(s.keys, t);
        const dist = Math.hypot(p[0] - a.x, (p[1] - a.z) * Z_UNIT);
        const speed = dist / Math.max(dt, 1e-3);
        a.phase += dist * (speed > 2 ? 6.5 : 8.3);
        a.move = lerp(a.move, clamp(speed / 0.9, 0, 1), 0.25);
        a.run = speed > 2;
        a.x = p[0]; a.z = p[1];
        a.fall = s.fallAt != null ? clamp((t - s.fallAt) / 0.55, 0, 1) : 0;
        a.fight = s.fightAt != null && t >= s.fightAt;
        a.rx = a.fight ? a.x + Math.sin(t * 9 + a.i * 2.1) * 0.11 : a.x;
        a.t = t;
        a.trailT -= dt;
        if (a.trailT <= 0 && a.move > 0.3) {
          a.trail.push([a.x, a.z]);
          if (a.trail.length > 22) a.trail.shift();
          a.trailT = 0.12;
        }
      }
      if (!this.fired && t >= S.alert.at) {
        this.fired = true;
        this.flash = 1;
        this.emitStatus();
      }
    }

    accumulateHeat(dt) {
      const G = this.heatGrid;
      for (const a of this.actors) {
        const ix = Math.floor(((a.x + 10) / 20) * 50), iz = Math.floor(a.z * 26);
        if (ix < 0 || ix >= 50 || iz < 0 || iz >= 26) continue;
        const i = iz * 50 + ix;
        G[i] += dt;
        if (G[i] > this.heatMax) this.heatMax = G[i];
      }
      for (let i = 0; i < G.length; i++) G[i] *= 0.9995;
      this.heatMax *= 0.9995;
    }

    tick(now) {
      if (!this.last) { this.last = now; return; }
      const el = now - this.last;
      if (el < 1000 / this.o.fps - 2) return;
      this.last = now;
      this.update(Math.min(el / 1000, 0.1));
      this.draw();
    }

    /* ---------- dibujo ---------- */

    draw() {
      if (!this.W) return;
      const g = this.ctx, W = this.W, H = this.H;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.bg, 0, 0);
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      if (this.heatGrid) this.drawHeat(g);

      const S = this.script;
      const zone = S ? S.zone : (this.o.zone || (this.o.overlays && this.o.suspect)) ? this.L.zone : null;
      if (zone && this.o.overlays) this.drawZone(g, zone);

      const items = this.actors.map((a) => ({ a, car: false, z: a.z })).concat(this.cars.map((c) => ({ a: c, car: true, z: c.z })));
      items.sort((p, q) => q.z - p.z);
      for (const it of items) {
        if (it.car) this.drawCar(g, it.a); else this.drawPerson(g, it.a);
      }

      if (this.o.overlays) this.drawOverlays(g);

      // Postproducción: barrido, grano, viñeta.
      g.globalAlpha = 1;
      g.fillStyle = this.scanPat;
      g.fillRect(0, 0, W, H);
      const np = this.noisePat[(Math.random() * this.noisePat.length) | 0];
      const ox = (Math.random() * 128) | 0, oy = (Math.random() * 128) | 0;
      g.save();
      g.translate(-ox, -oy);
      g.globalAlpha = 0.55;
      g.fillStyle = np;
      g.fillRect(0, 0, W + ox, H + oy);
      g.restore();
      g.fillStyle = this.vignette;
      g.fillRect(0, 0, W, H);

      if (this.flash > 0) {
        g.strokeStyle = rgba(ALERT, this.flash * 0.9);
        g.lineWidth = 6;
        g.strokeRect(3, 3, W - 6, H - 6);
        g.fillStyle = rgba(ALERT, this.flash * 0.08);
        g.fillRect(0, 0, W, H);
      }

      if (this.o.timestamp) this.drawTimestamp(g);

      if (S) {
        if (S.speedup) {
          g.font = `500 ${this.fs}px ${MONO}`;
          g.fillStyle = 'rgba(255,255,255,0.7)';
          g.textBaseline = 'alphabetic';
          g.fillText(`${str().playback} ×${S.speedup}`, 16, H - 16);
        }
        // Corte a negro en la costura del loop.
        const t = this.st;
        let fade = 0;
        if (t < 0.35) fade = 1 - t / 0.35;
        else if (t > S.T - 0.45) fade = (t - (S.T - 0.45)) / 0.45;
        if (fade > 0 && !reduceMotion) {
          g.fillStyle = `rgba(0,0,0,${clamp(fade, 0, 1).toFixed(3)})`;
          g.fillRect(0, 0, W, H);
        }
        if (this.o.onFrame) this.o.onFrame(t / S.T);
      }
    }

    drawTimestamp(g) {
      const d = new Date();
      const date = lang === 'en'
        ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
      const txt = `${date}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      g.font = `500 ${this.fs}px ${MONO}`;
      g.textBaseline = 'top';
      g.textAlign = 'right';
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillText(txt, this.W - 10, 10);
      g.textAlign = 'left';
    }

    drawHeat(g) {
      const G = this.heatGrid, max = Math.max(this.heatMax, 0.5);
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let iz = 0; iz < 26; iz++) {
        for (let ix = 0; ix < 50; ix++) {
          const v = G[iz * 50 + ix] / max;
          if (v < 0.04) continue;
          const x = (ix + 0.5) / 50 * 20 - 10, z = (iz + 0.5) / 26;
          const p = this.P(x, 0, z);
          const w = (20 / 50) * p.k * 3.2;
          const sprite = tex.heat[Math.min(tex.heat.length - 1, Math.floor(v * tex.heat.length))];
          g.globalAlpha = clamp(0.15 + v * 0.55, 0, 0.7);
          g.drawImage(sprite, p.x - w / 2, p.y - w * 0.2, w, w * 0.4);
        }
      }
      g.restore();
    }

    drawZone(g, zone) {
      const a = this.P(zone.x[0], 0, zone.z[0]), b = this.P(zone.x[1], 0, zone.z[0]);
      const c = this.P(zone.x[1], 0, zone.z[1]), d = this.P(zone.x[0], 0, zone.z[1]);
      let n = 0;
      for (const p of this.actors) if (p.x > zone.x[0] && p.x < zone.x[1] && p.z > zone.z[0] && p.z < zone.z[1]) n++;
      const alert = this.script ? this.fired : this.o.alert;
      const col = alert && n ? ALERT : ZONE;
      quad(g, a, b, c, d, rgba(col, n ? 0.1 : 0.045));
      g.setLineDash([6, 5]);
      quad(g, a, b, c, d, null, rgba(col, 0.6));
      g.setLineDash([]);
      g.font = `500 ${this.fs * 0.92}px ${MONO}`;
      g.textBaseline = 'bottom';
      g.fillStyle = rgba(col, 0.9);
      g.fillText(`${str().zones[zone.key]} · ${n}`, d.x + 4, d.y - 5);
    }

    personBox(a) {
      const p = this.P(a.rx != null ? a.rx : a.x, 0, a.z), k = p.k;
      const f = ease(a.fall || 0);
      const st = { x: p.x - 0.24 * k, y: p.y - 1.05 * k, w: 0.48 * k, h: 1.1 * k };
      if (!f) return st;
      const ly = { x: p.x - 0.16 * k, y: p.y - 0.38 * k, w: 1.16 * k, h: 0.44 * k };
      return { x: lerp(st.x, ly.x, f), y: lerp(st.y, ly.y, f), w: lerp(st.w, ly.w, f), h: lerp(st.h, ly.h, f) };
    }

    drawPerson(g, a) {
      const x = a.rx != null ? a.rx : a.x;
      const p = this.P(x, 0, a.z), k = p.k;
      if (p.x < -k * 1.5 || p.x > this.W + k * 1.5) return;
      // Color opaco (no alfa) para que las uniones del cuerpo no se vean más claras.
      const lum = 0.5 + 0.38 * (1 - clamp(a.z, 0, 1));
      const body = `rgb(${Math.round(lerp(16, 190, lum))},${Math.round(lerp(16, 194, lum))},${Math.round(lerp(19, 210, lum))})`;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.beginPath();
      g.ellipse(p.x + (a.fall ? 0.4 * k * ease(a.fall) : 0), p.y, (0.2 + 0.4 * (a.fall || 0)) * k, 0.045 * k, 0, 0, TAU);
      g.fill();

      g.save();
      g.translate(p.x, p.y);
      if (a.fall) g.rotate(ease(a.fall) * 1.45);
      g.strokeStyle = body;
      g.fillStyle = body;
      g.lineCap = 'round';
      const still = 1 - (a.fall || 0);
      const amp = a.run ? 0.75 : 0.42;
      const sw = Math.sin(a.phase) * amp * a.move * still;
      g.lineWidth = 0.085 * k;
      g.beginPath();
      g.moveTo(-0.045 * k, -0.5 * k); g.lineTo((-0.045 + Math.sin(sw) * 0.5) * k, (-0.5 + Math.cos(sw) * 0.5) * k);
      g.moveTo(0.045 * k, -0.5 * k); g.lineTo((0.045 + Math.sin(-sw) * 0.5) * k, (-0.5 + Math.cos(-sw) * 0.5) * k);
      g.stroke();
      g.lineWidth = 0.21 * k;
      g.beginPath(); g.moveTo(0, -0.53 * k); g.lineTo(0, -0.79 * k); g.stroke();
      g.lineWidth = 0.06 * k;
      g.beginPath();
      const face = (a.spec && a.spec.face) || 1;
      [-1, 1].forEach((side) => {
        let ang, len = 0.34;
        if (a.fight) {
          // Golpes alternados hacia el oponente: brazo casi horizontal que se estira y recoge.
          ang = face * (1.45 + Math.sin(a.t * 13 + side * 1.7 + a.i) * 0.3);
          len = 0.34 * (0.6 + 0.4 * Math.abs(Math.sin(a.t * 9 + side * 1.6 + a.i)));
        } else {
          ang = (side < 0 ? sw : -sw) * 0.85;
        }
        const sx = side * 0.11 * k, sy = -0.78 * k;
        g.moveTo(sx, sy);
        g.lineTo(sx + Math.sin(ang) * len * k, sy + Math.cos(ang) * len * k);
      });
      g.stroke();
      g.beginPath();
      g.arc(0, -0.92 * k, 0.078 * k, 0, TAU);
      g.fill();
      g.restore();
    }

    drawCar(g, c) {
      c.pts = null;
      const p = this.P(c.x, 0, c.z);
      if (c.wait > 0 || p.x < -p.k * 4 || p.x > this.W + p.k * 4) return;
      const L2 = 1.3, dz = 0.028;
      const front = c.x + c.dir * L2;
      this.pool(g, front + c.dir * 2.6, c.z, 3, [255, 240, 210], 0.16);
      const pts = this.box(g, c.x - L2, c.x + L2, c.z - dz, c.z + dz, 0.85, STYLE.car);
      // Ventanas laterales.
      const wx0 = c.x - L2 + 0.55, wx1 = c.x + L2 - 0.75;
      quad(g, this.P(wx0, 0.5, c.z - dz), this.P(wx1, 0.5, c.z - dz), this.P(wx1 - 0.1, 0.78, c.z - dz), this.P(wx0 + 0.15, 0.78, c.z - dz), 'rgba(0,0,0,0.55)', 'rgba(205,210,230,0.18)');
      [c.x - L2 + 0.55, c.x + L2 - 0.55].forEach((wx) => {
        const w = this.P(wx, 0.16, c.z - dz);
        g.fillStyle = '#070708';
        g.beginPath(); g.arc(w.x, w.y, 0.17 * w.k, 0, TAU); g.fill();
      });
      this.glow(g, front, 0.38, c.z - dz, 0.9, [255, 245, 220], 0.45);
      this.glow(g, front, 0.38, c.z - dz, 0.12, [255, 255, 245], 1);
      this.glow(g, c.x - c.dir * L2, 0.4, c.z - dz, 0.35, [255, 60, 50], 0.6);
      c.pts = pts;
    }

    drawOverlays(g) {
      const S = this.script;
      const alertOn = S ? this.fired : this.o.alert;
      const who = S ? S.alert.who : [];
      const lw = Math.max(1.25, this.fs / 8);

      // Recorridos.
      for (const a of this.actors) {
        const tr = a.trail;
        for (let i = 0; i < tr.length; i++) {
          const p = this.P(tr[i][0], 0, tr[i][1]);
          g.fillStyle = rgba(SIGNAL, ((i + 1) / tr.length) * 0.55);
          g.fillRect(p.x - 1, p.y - 1, 2, 2);
        }
      }

      // Personas.
      this.actors.forEach((a, idx) => {
        const b = this.personBox(a);
        if (b.x + b.w < 0 || b.x > this.W || b.w < 6) return;
        const isAlert = alertOn && (S ? who.indexOf(idx) >= 0 : a.suspect);
        if (S && S.alert.group && isAlert) return;
        const col = isAlert ? ALERT : SIGNAL;
        this.brackets(g, b, col, lw, isAlert);
        let txt;
        const tx = str();
        const alertLabel = tx[S ? this.scriptName : 'loiter'][0];
        if (isAlert) txt = S && S.speedup ? `${alertLabel} · ${mmss(this.st * S.speedup)}` : alertLabel;
        else if (S && a.spec.dwell) txt = `${tx.person} · ${mmss(this.st * S.speedup)}`;
        else txt = b.w > 34 ? `${tx.person} ${Math.round((a.conf || 0.9) * 100)}%` : `#${a.id}`;
        this.label(g, b.x, b.y, txt, col, isAlert);
        if (b.w > 46 && !isAlert) this.smallId(g, b, a.id, col);
      });

      // Altercado: un solo cuadro que abarca a ambos.
      if (S && S.alert.group && alertOn) {
        const bs = who.map((i) => this.personBox(this.actors[i]));
        const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
        const x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h));
        const m = 6;
        const box = { x: x0 - m, y: y0 - m, w: x1 - x0 + m * 2, h: y1 - y0 + m * 2 };
        this.brackets(g, box, ALERT, lw, true);
        this.label(g, box.x, box.y, str()[this.scriptName][0], ALERT, true);
      }

      // Vehículos.
      for (const c of this.cars) {
        if (!c.pts || c.wait > 0) continue;
        const xs = c.pts.map((p) => p.x), ys = c.pts.map((p) => p.y);
        const b = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        if (b.x + b.w < 0 || b.x > this.W) continue;
        this.brackets(g, b, VEHICLE, lw, false);
        this.label(g, b.x, b.y, b.w > 50 ? `${str().vehicle} ${Math.round(c.conf * 100)}%` : str().veh, VEHICLE, false);
      }
    }

    brackets(g, b, col, lw, strong) {
      const l = Math.max(4, Math.min(b.w, b.h) * 0.24);
      g.lineWidth = lw;
      g.strokeStyle = rgba(col, strong ? 0.28 : 0.16);
      g.strokeRect(b.x, b.y, b.w, b.h);
      if (strong) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
        g.strokeStyle = rgba(col, 0.25 + pulse * 0.35);
        g.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      }
      g.strokeStyle = rgba(col, 1);
      g.lineWidth = lw * 1.4;
      g.beginPath();
      g.moveTo(b.x, b.y + l); g.lineTo(b.x, b.y); g.lineTo(b.x + l, b.y);
      g.moveTo(b.x + b.w - l, b.y); g.lineTo(b.x + b.w, b.y); g.lineTo(b.x + b.w, b.y + l);
      g.moveTo(b.x + b.w, b.y + b.h - l); g.lineTo(b.x + b.w, b.y + b.h); g.lineTo(b.x + b.w - l, b.y + b.h);
      g.moveTo(b.x + l, b.y + b.h); g.lineTo(b.x, b.y + b.h); g.lineTo(b.x, b.y + b.h - l);
      g.stroke();
    }

    label(g, x, y, text, col, alert) {
      const fs = this.fs;
      g.font = `600 ${fs}px ${MONO}`;
      const w = g.measureText(text).width + fs, h = fs * 1.6;
      let ly = y - h - 3;
      if (ly < 2) ly = y + 3;
      const lx = clamp(x, 2, this.W - w - 2);
      g.fillStyle = rgba(alert ? ALERT_LABEL : col, 0.94);
      g.fillRect(lx, ly, w, h);
      g.fillStyle = alert ? '#ffffff' : '#0f1116';
      g.textBaseline = 'middle';
      g.fillText(text, lx + fs * 0.5, ly + h / 2 + 0.5);
    }

    smallId(g, b, id, col) {
      g.font = `500 ${this.fs * 0.85}px ${MONO}`;
      g.fillStyle = rgba(col, 0.8);
      g.textBaseline = 'top';
      g.fillText(`ID ${id}`, b.x + 3, b.y + b.h + 4);
    }
  }

  global.BrunellScene = {
    create: (canvas, opts) => new Scene(canvas, opts),
    scripts: SCRIPTS,
    reduceMotion,
    // Cambia el idioma de las etiquetas y redibuja todo (también los cuadros
    // fijos del modo de movimiento reducido).
    setLang(l) {
      lang = l === 'en' ? 'en' : 'es';
      for (const s of scenes) { s.emitStatus(); s.draw(); }
    },
  };
})(window);
