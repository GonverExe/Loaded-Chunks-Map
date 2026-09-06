/* Modo claro / oscuro: preferencia del sistema por defecto, elección recordada. */
(function (global) {
  'use strict';

  const STORE_KEY = 'lcm.theme';
  const listeners = [];
  const media = global.matchMedia ? global.matchMedia('(prefers-color-scheme: light)') : null;
  let explicit = null;   // null = seguimos al sistema

  function stored() {
    try { return localStorage.getItem(STORE_KEY); } catch (_) { return null; }
  }
  function systemTheme() { return media && media.matches ? 'light' : 'dark'; }
  function current() { return explicit || systemTheme(); }

  function paint() {
    document.documentElement.setAttribute('data-theme', current());
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', current() === 'light' ? '#f4f7fb' : '#070a11');
    listeners.forEach((fn) => fn(current()));
  }

  function set(theme) {
    explicit = (theme === 'light' || theme === 'dark') ? theme : null;
    try {
      if (explicit) localStorage.setItem(STORE_KEY, explicit);
      else localStorage.removeItem(STORE_KEY);
    } catch (_) {}
    paint();
  }

  function toggle() { set(current() === 'dark' ? 'light' : 'dark'); }
  function onChange(fn) { listeners.push(fn); }

  const saved = stored();
  if (saved === 'light' || saved === 'dark') explicit = saved;
  if (media && media.addEventListener) {
    media.addEventListener('change', () => { if (!explicit) paint(); });
  }

  global.Theme = { set, toggle, onChange, current, paint };
})(window);
