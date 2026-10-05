/* Brunell Node — interacción de la página. Sin dependencias. */
(function () {
  'use strict';

  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Idioma ---------- */

  // El español es el texto original del HTML; el inglés vive en i18n.js.
  // El idioma inicial ya lo decidió el script del <head> (html[lang]).
  const I18N = window.BrunellI18n || { en: {}, es: {} };
  let lang = root.lang === 'en' ? 'en' : 'es';
  const tr = (key) => {
    const d = I18N[lang] || {};
    return d[key] != null ? d[key] : null;
  };

  // Se guarda el español antes de tocar nada, para poder volver a él.
  const i18nNodes = $$('[data-i18n]').map((el) => ({ el, key: el.dataset.i18n, es: el.innerHTML.trim() }));
  const i18nAttrs = [];
  $$('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) i18nAttrs.push({ el, attr, key, es: el.getAttribute(attr) });
    });
  });
  const metaTargets = [
    { el: $('title'), key: 'meta.title', text: true },
    { el: $('meta[name="description"]'), key: 'meta.desc' },
    { el: $('meta[property="og:title"]'), key: 'meta.ogTitle' },
    { el: $('meta[property="og:description"]'), key: 'meta.ogDesc' },
  ].filter((m) => m.el).map((m) => Object.assign(m, { es: m.text ? m.el.textContent : m.el.getAttribute('content') }));
  const langHooks = [];   // secciones con texto armado por JS se registran aquí

  function applyLang(next, remember) {
    lang = next === 'en' ? 'en' : 'es';
    root.lang = lang;
    const en = lang === 'en' ? I18N.en : null;
    const pick = (key, es) => (en && en[key] != null ? en[key] : es);
    i18nNodes.forEach((n) => { n.el.innerHTML = pick(n.key, n.es); });
    i18nAttrs.forEach((a) => a.el.setAttribute(a.attr, pick(a.key, a.es)));
    metaTargets.forEach((m) => {
      if (m.text) m.el.textContent = pick(m.key, m.es);
      else m.el.setAttribute('content', pick(m.key, m.es));
    });
    // Solo se traduce el asunto del correo: el destinatario queda como esté en el HTML.
    $$('[data-i18n-subject]').forEach((a) => {
      const subject = tr(a.dataset.i18nSubject);
      if (subject) a.setAttribute('href', a.getAttribute('href').replace(/([?&]subject=)[^&]*/, `$1${encodeURIComponent(subject)}`));
    });
    $$('.lang [data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    langHooks.forEach((fn) => fn(lang));
    if (window.BrunellScene) window.BrunellScene.setLang(lang);
    if (remember) {
      try { localStorage.setItem('bn-lang', lang); } catch (e) { /* sin almacenamiento */ }
      try {
        const u = new URL(location.href);
        u.searchParams.set('lang', lang);
        history.replaceState(history.state, '', u);
      } catch (e) { /* URL de solo lectura (p. ej. file://) */ }
    }
    root.classList.remove('i18n-pending');
  }

  // Cambio con un breve fundido a negro, como un corte de cámara.
  function switchLang(next) {
    if (next === lang) return;
    if (reduce) { applyLang(next, true); return; }
    root.classList.add('lang-fade');
    setTimeout(() => {
      applyLang(next, true);
      requestAnimationFrame(() => root.classList.remove('lang-fade'));
    }, 200);
  }

  $$('.lang [data-lang]').forEach((b) => b.addEventListener('click', () => switchLang(b.dataset.lang)));
  applyLang(lang, false);

  /* ---------- Intro ---------- */

  const intro = $('.intro');
  let seen = false;
  try { seen = sessionStorage.getItem('bn-intro') === '1'; } catch (e) { /* sin almacenamiento */ }

  function endIntro() {
    if (root.classList.contains('intro-done')) return;
    root.classList.add('intro-done');
    try { sessionStorage.setItem('bn-intro', '1'); } catch (e) { /* sin almacenamiento */ }
    if (intro) setTimeout(() => intro.remove(), reduce ? 0 : 1300);
  }

  if (reduce || seen || !intro) {
    if (intro) intro.remove();
    root.classList.add('intro-done', 'intro-skip');
  } else {
    root.classList.add('intro-run');
    setTimeout(endIntro, 2100);
    intro.addEventListener('click', endIntro);
  }

  /* ---------- Escenas ---------- */

  const Scene = window.BrunellScene;
  const heroCount = $('[data-hero-count]');
  const feeds = [];
  let incidentScene = null;

  // Estado de las pestañas de incidentes: la escena llama a estos callbacks
  // apenas se crea, así que tienen que existir antes.
  const tabs = $$('.itab');
  const statusEl = $('[data-incident-status]');
  const screen = $('.incidents__screen');
  let tabIndex = 0;
  let activeBar = tabs[0] ? $('.itab__bar i', tabs[0]) : null;
  let autoplay = !reduce;
  let incidentsVisible = false;

  function setIncidentStatus(text, alert) {
    if (statusEl) statusEl.textContent = text;
    if (screen) screen.classList.toggle('is-alert', !!alert);
  }

  $$('canvas[data-scene]').forEach((c) => {
    const kind = c.dataset.scene;
    if (!Scene) return;
    if (kind === 'hero') {
      Scene.create(c, {
        layout: 'plaza', seed: 3, walkers: 8, cars: { z: 0.62, speed: 4.4 }, zone: true, fps: 30, maxDpr: 1.5, focusX: 0.64,
        // Recorridos cargados a la derecha: el titular vive a la izquierda.
        hot: [[0, 0.95], [9, 0.36], [7, 0.78], [3.2, 0.1], [1.6, 0.5], [13, 0.88], [4.6, 0.24], [5.4, 0.6], [-4, 0.85], [-1, 0.3]],
        onCount: (n) => { if (heroCount) heroCount.textContent = n; },
      });
    } else if (kind === 'feed') {
      const layout = c.dataset.layout || 'plaza';
      const s = Scene.create(c, {
        layout,
        seed: Number(c.dataset.seed) || 1,
        walkers: layout === 'bodega' ? 2 : 3,
        cars: layout === 'estacionamiento',
        suspect: c.dataset.suspect === 'true',
        overlays: c.dataset.overlays === 'true',
        timestamp: true, fps: 24, maxDpr: 1.5,
      });
      if (c.closest('.story')) feeds.push(s);
    } else if (kind === 'heat') {
      Scene.create(c, { layout: 'plaza', seed: 8, walkers: 10, heat: true, overlays: true, fps: 24, maxDpr: 1.5 });
    } else if (kind === 'incident') {
      incidentScene = Scene.create(c, {
        mode: 'incident', scenario: 'loiter', fps: 30, maxDpr: 1.75,
        onStatus: setIncidentStatus,
        onFrame: (p) => { if (activeBar) activeBar.style.transform = `scaleX(${p})`; },
        onLoop: () => { if (autoplay) selectTab((tabIndex + 1) % tabs.length, false); },
      });
    }
  });

  /* ---------- Cabecera, menú y progreso ---------- */

  const header = $('.header');
  const progress = $('.progress span');
  const toggle = $('.menu-toggle');
  let lastY = window.scrollY;

  if (toggle) {
    const menuLabel = () => {
      toggle.querySelector('.sr-only').textContent = tr(root.classList.contains('menu-open') ? 'menu.close' : 'menu.open');
    };
    menuLabel();
    langHooks.push(menuLabel);
    toggle.addEventListener('click', () => {
      const open = root.classList.toggle('menu-open');
      toggle.setAttribute('aria-expanded', String(open));
      menuLabel();
    });
    $$('#nav a').forEach((a) => a.addEventListener('click', () => {
      root.classList.remove('menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      menuLabel();
    }));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && root.classList.contains('menu-open')) { toggle.click(); toggle.focus(); }
    });
  }

  /* ---------- Revelado al entrar en pantalla ---------- */

  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      revealIO.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  $$('[data-reveal], .monitor').forEach((el) => revealIO.observe(el));

  /* ---------- Texto que se ilumina con el scroll ---------- */

  const scrub = $('[data-scrub]');
  let scrubWords = [];
  function buildScrub() {
    const text = scrub.textContent.trim().replace(/\s+/g, ' ');
    const words = text.split(' ');
    // Copia legible para lectores de pantalla; las palabras sueltas son solo visuales.
    scrub.innerHTML = `<span class="sr-only">${text}</span>` +
      words.map((w) => `<span class="w" aria-hidden="true">${w}</span>`).join(' ');
    scrubWords = $$('.w', scrub);
  }
  if (scrub) {
    buildScrub();
    // applyLang deja el texto plano traducido: se vuelve a partir en palabras.
    langHooks.push(() => { buildScrub(); requestTick(); });
  }

  /* ---------- Historia fijada: 3 pasos ---------- */

  const track = $('.story__track');
  const steps = $$('.story .step');
  const stage = $('.story__stage');
  const stepNum = $('[data-step-num]');
  const rail = $('.story__rail span');
  let currentStep = -1;

  function setStep(i) {
    if (i === currentStep) return;
    currentStep = i;
    steps.forEach((s, j) => s.classList.toggle('is-active', j === i));
    if (stage) stage.dataset.stage = String(i);
    if (stepNum) stepNum.textContent = String(i + 1).padStart(2, '0');
    feeds.forEach((f) => f.set({ overlays: i >= 1, alert: i >= 2 && f.o.suspect }));
  }
  setStep(0);

  /* ---------- Bucle de scroll (un solo rAF) ---------- */

  const hero = $('.hero');
  const heroMedia = $('.hero__media');
  const heroContent = $('.hero__content');
  const manifesto = $('.manifesto');
  let ticking = false;

  function onScroll() {
    ticking = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    const docH = document.documentElement.scrollHeight - vh;

    if (progress) progress.style.transform = `scaleX(${docH > 0 ? y / docH : 0})`;

    if (header) {
      header.classList.toggle('is-scrolled', y > 40);
      const hide = y > lastY && y > vh * 0.9 && !root.classList.contains('menu-open');
      header.classList.toggle('is-hidden', hide);
    }
    lastY = y;

    if (!reduce && hero && y < hero.offsetHeight * 1.2) {
      const p = clamp(y / hero.offsetHeight, 0, 1);
      if (heroMedia) heroMedia.style.transform = `translate3d(0, ${p * 18}vh, 0) scale(${1 + p * 0.12})`;
      if (heroContent) {
        heroContent.style.transform = `translate3d(0, ${p * -9}vh, 0)`;
        heroContent.style.opacity = String(1 - p * 1.3);
      }
    }

    if (manifesto && scrubWords.length) {
      const r = manifesto.getBoundingClientRect();
      const p = clamp((vh * 0.75 - r.top) / (r.height - vh * 0.5), 0, 1);
      const lit = p * scrubWords.length * 1.15;
      scrubWords.forEach((w, i) => w.classList.toggle('is-lit', i < lit));
    }

    if (track) {
      const r = track.getBoundingClientRect();
      const total = r.height - vh;
      const p = clamp(-r.top / (total || 1), 0, 1);
      if (rail) rail.style.transform = `scaleX(${p})`;
      setStep(Math.min(2, Math.floor(p * 3)));
    }
  }

  function requestTick() {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }
  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', requestTick);
  onScroll();

  /* ---------- Incidentes: pestañas ---------- */

  function selectTab(i, focus) {
    tabIndex = i;
    tabs.forEach((t, j) => {
      const on = j === i;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const bar = $('.itab__bar i', t);
      if (bar) bar.style.transform = on && reduce ? 'scaleX(1)' : 'scaleX(0)';
    });
    activeBar = $('.itab__bar i', tabs[i]);
    if (focus) tabs[i].focus();
    if (incidentScene) incidentScene.setScenario(tabs[i].dataset.scenario);
    if (tabs[i].scrollIntoView && window.innerWidth < 860 && incidentsVisible) {
      tabs[i].scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => { autoplay = false; selectTab(i, false); });
    t.addEventListener('keydown', (e) => {
      let n = null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = (i + 1) % tabs.length;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') n = 0;
      if (e.key === 'End') n = tabs.length - 1;
      if (n !== null) { e.preventDefault(); autoplay = false; selectTab(n, true); }
    });
  });
  if (reduce && activeBar) activeBar.style.transform = 'scaleX(1)';

  if (screen) {
    new IntersectionObserver((es) => { incidentsVisible = es[0].isIntersecting; }, { threshold: 0.3 }).observe(screen);
  }

  /* ---------- Contadores ---------- */

  function runCounter(el) {
    const to = Number(el.dataset.count);
    const from = to === 0 ? 12 : 0;
    const suffix = el.dataset.suffix || '';
    if (reduce) { el.textContent = to + suffix; return; }
    const dur = 1600;
    const t0 = performance.now();
    const step = (now) => {
      const p = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(from + (to - from) * e) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      runCounter(e.target);
      countIO.unobserve(e.target);
    });
  }, { threshold: 0.6 });
  $$('[data-count]').forEach((el) => {
    if (!reduce) el.textContent = (Number(el.dataset.count) === 0 ? 12 : 0) + (el.dataset.suffix || '');
    countIO.observe(el);
  });

  /* ---------- Búsqueda escrita a mano ---------- */

  const typer = $('[data-typer]');
  const searchDemo = $('.search-demo');
  const phrasesFor = () => tr('search.phrases') || [''];
  if (typer && searchDemo) {
    if (reduce) {
      const still = () => {
        typer.textContent = phrasesFor()[0];
        searchDemo.classList.add('has-results');
      };
      still();
      langHooks.push(still);
    } else {
      let phrases = phrasesFor();
      let pi = 0, ci = 0, deleting = false, searchVisible = false;
      // Al cambiar de idioma se borra lo escrito y se empieza con la primera frase nueva.
      langHooks.push(() => {
        phrases = phrasesFor();
        pi = 0; ci = 0; deleting = false;
        typer.textContent = '';
        searchDemo.classList.remove('has-results');
      });
      new IntersectionObserver((es) => { searchVisible = es[0].isIntersecting; }, { threshold: 0.2 }).observe(searchDemo);
      const typeStep = () => {
        let delay = 60 + Math.random() * 50;
        if (searchVisible) {
          const ph = phrases[pi];
          if (!deleting) {
            ci = Math.min(ci + 1, ph.length);
            typer.textContent = ph.slice(0, ci);
            if (ci === ph.length) { searchDemo.classList.add('has-results'); deleting = true; delay = 2600; }
          } else {
            if (ci === ph.length) searchDemo.classList.remove('has-results');
            ci = Math.max(ci - 1, 0);
            typer.textContent = ph.slice(0, ci);
            delay = 24;
            if (ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; delay = 500; }
          }
        } else {
          delay = 400;
        }
        setTimeout(typeStep, delay);
      };
      setTimeout(typeStep, 800);
    }
  }

  /* ---------- Reloj del HUD ---------- */

  const clock = $('[data-clock]');
  if (clock) {
    const pad = (n) => String(n).padStart(2, '0');
    const tickClock = () => {
      const d = new Date();
      clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    tickClock();
    setInterval(tickClock, 1000);
  }

  const year = $('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Luz que sigue al puntero en las tarjetas ---------- */

  $$('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  /* ---------- Cursor ---------- */

  const cursor = $('.cursor');
  if (cursor && !reduce && window.matchMedia('(pointer: fine)').matches) {
    root.classList.add('has-cursor');
    let tx = -100, ty = -100, cx = -100, cy = -100, raf = 0;
    const follow = () => {
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.3 ? requestAnimationFrame(follow) : 0;
    };
    window.addEventListener('pointermove', (e) => {
      tx = e.clientX; ty = e.clientY;
      if (!raf) raf = requestAnimationFrame(follow);
    }, { passive: true });
    document.addEventListener('pointerover', (e) => {
      cursor.classList.toggle('is-hover', !!e.target.closest('a, button, summary, [role="tab"]'));
    });
    document.addEventListener('pointerleave', () => cursor.classList.add('is-out'));
    document.addEventListener('pointerenter', () => cursor.classList.remove('is-out'));
  }
})();
