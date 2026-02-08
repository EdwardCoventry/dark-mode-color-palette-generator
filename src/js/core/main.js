import { SHADES_OF_BLACK } from '../../data/shades-of-black.js';

// Optional context identifier for embedded mode (supplied via ?ctx=... or ?id=...)
let EMBED_CTX = null;

// Build reverse lookup once: VV -> preferred name. Choose the first occurrence to keep names stable.
const COMPONENT_TO_NAME = (() => {
  const map = Object.create(null);
  for (const [name, comp] of Object.entries(SHADES_OF_BLACK || {})) {
    const key = String(comp || '').toUpperCase().padStart(2, '0');
    if (!/^[0-9A-F]{2}$/.test(key)) continue;
    if (!map[key]) map[key] = name;
  }
  return map;
})();

function hexFromName (name) {
  const comp = (SHADES_OF_BLACK && SHADES_OF_BLACK[name]) ? String(SHADES_OF_BLACK[name]).toUpperCase().padStart(2, '0') : null;
  if (!comp || !/^[0-9A-F]{2}$/.test(comp)) return null;
  return `#${comp}${comp}${comp}`;
}

function nameFromHex (hex) {
  if (!hex) return '';
  const norm = normalizeHex6(hex);
  if (!norm) return '';
  const raw = norm.replace(/^#/, '');
  const r = raw.slice(0,2), g = raw.slice(2,4), b = raw.slice(4,6);
  if (r !== g || g !== b) return '';
  return COMPONENT_TO_NAME[r] || '';
}

/* ----- helpers ------------------------------------------------------- */
// History behavior: 'push' creates entries for each generation; 'replace' keeps a single entry so Back leaves the page
let HISTORY_MODE = 'push'; // will be set in init() based on embed/flags

function randomShade () {
  // Bias toward darker: square the RNG, cap to 0–63 (quarter range)
  const v   = Math.floor(Math.pow(Math.random(), 2) * 64);
  const hex = v.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`.toUpperCase();
}

function normalizeHex6 (s) {
  if (!s) return null;
  const raw = s.startsWith('#') ? s.slice(1) : s;
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return `#${raw.toUpperCase()}`;
}

// Determine if background is light enough to require dark (black) text
function isLightBackground(hex) {
  if (!hex) return false;
  const raw = hex.startsWith('#') ? hex.slice(1) : hex;
  if (raw.length !== 6) return false;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  // Perceived luminance (Rec. 601) vs a midpoint threshold; shades are grayscale but this is robust
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return y >= 140; // around mid-gray; ensures white flips to black text
}

function applyContrastStyles(col, hex) {
  const info = col.querySelector('.info');
  const btn = col.querySelector('.lock-btn');
  const locked = col.dataset.locked === 'true';
  const lightBg = isLightBackground(hex);

  // Text color for overlay
  info.style.color = lightBg ? '#000' : '#FFF';

  // Adjust lock button appearance only when not locked; when locked, let CSS style take precedence
  if (!locked) {
    btn.style.color = lightBg ? '#000' : '#FFF';
    btn.style.borderColor = lightBg ? 'rgba(0,0,0,.85)' : 'rgba(255,255,255,.85)';
    btn.style.background = 'transparent';
  } else {
    // Clear inline to allow CSS state styles to apply
    btn.style.removeProperty('color');
    btn.style.removeProperty('border-color');
    btn.style.removeProperty('background');
  }
}

// Session-scoped usage counter (not persisted).
const sessionUsage = Object.create(null);

function bumpUsage (usage, hex, delta = 1) {
  const k = String(hex || '').toUpperCase();
  if (!k || !/^#[0-9A-F]{6}$/.test(k)) return;
  usage[k] = (usage[k] || 0) + delta;
}

// Build unique hex shades: prefer dictionary entries, then random unique grayscale if needed.
// Bias selection toward hexes that have been used less frequently in this session.
function buildUniqueHexes (needed, excludeHexes = new Set(), usage = {}, bias = 1.0) {
  const out = [];
  const used = new Set([...excludeHexes].map(h => String(h).toUpperCase()));

  // 1) Build candidate list from NAME_DICT, dedup by resulting hex
  const candidateSet = new Set();
  const candidates = [];
  for (const name of Object.keys(SHADES_OF_BLACK)) {
    const hex = hexFromName(name)?.toUpperCase();
    if (!hex) continue;
    if (used.has(hex)) continue;           // avoid anything already used/excluded
    if (candidateSet.has(hex)) continue;   // many names map to same grayscale hex
    candidateSet.add(hex);
    const count = usage[hex] || 0;
    // Higher score -> more likely to be picked. Downweight by past usage.
    const score = Math.random() / (1 + count * Math.max(0, bias));
    candidates.push({ hex, score });
  }

  // Randomized, usage-aware ordering
  candidates.sort((a, b) => b.score - a.score);

  // 2) Take from candidates until satisfied or exhausted
  for (const c of candidates) {
    if (out.length >= needed) break;
    if (used.has(c.hex)) continue; // redundant, but safe
    used.add(c.hex);
    out.push(c.hex);
  }

  // 3) if still short, generate random grayscale shades avoiding used
  while (out.length < needed) {
    const hex = randomShade().toUpperCase();
    if (used.has(hex)) continue;
    used.add(hex);
    out.push(hex);
  }

  return out;
}

function columns () {
  return [...document.querySelectorAll('.color-col')];
}

function isMobileLikeViewport () {
  try {
    if (window.matchMedia) {
      if (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches) return true;
    }
  } catch { /* noop */ }
  return window.innerWidth <= 700;
}

function stackHexForDisplay (hex) {
  const norm = normalizeHex6(hex);
  if (!norm) return null;
  const raw = norm.slice(1);
  return [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4, 6)];
}

function renderStackedHex (hexEl, hex) {
  const parts = stackHexForDisplay(hex);
  if (!parts || !hexEl) {
    if (hexEl) hexEl.textContent = String(hex || '');
    return;
  }
  const lines = parts.map((part, idx) => {
    const line = document.createElement('span');
    line.className = idx === 0 ? 'hex-line hex-line--first' : 'hex-line';
    line.textContent = part;
    return line;
  });
  hexEl.replaceChildren(...lines);
}

function currentShadesHexList () {
  return columns().map(c => (c.dataset.shade || '#000000').toUpperCase());
}

function currentHashString () {
  return currentShadesHexList().map(h => h.slice(1)).join('-');
}

function buildOpenUrlWithState(baseUrl, { forceReplaceHistory = true } = {}) {
  try {
    const u = new URL(baseUrl, location.origin);
    if (forceReplaceHistory) {
      const existing = (u.searchParams.get('history') || u.searchParams.get('hist') || '').toLowerCase();
      if (!existing) u.searchParams.set('history', 'replace');
    }
    const h = currentHashString();
    if (h) u.hash = h;
    return u.toString();
  } catch {
    // Fallback: naive concatenation
    const q = forceReplaceHistory ? (baseUrl.includes('?') ? '&' : '?') + 'history=replace' : '';
    const h = currentHashString();
    return baseUrl + q + (h ? ('#' + h) : '');
  }
}

function broadcastStateToParent({ embedded }) {
  if (!embedded) return;
  const payload = {
    type: 'palette:update',
    app: 'color-palette-generator',
    ctx: EMBED_CTX,
    shades: currentShadesHexList(),
    hash: currentHashString(),
    // Suggest adding history=replace when opening the full app, so Back returns to referrer
    suggest: { history: 'replace' }
  };
  try { window.parent.postMessage(payload, '*'); } catch { /* noop */ }
}

function setColumnShade (col, hex, name = null) {
  const info = col.querySelector('.info');
  col.style.backgroundColor = hex;
  col.style.backgroundImage = 'none';
  col.dataset.shade = hex;
  const embedded = document.documentElement.classList.contains('embedded');
  const mobileLike = isMobileLikeViewport();
  const compactHex = hex.replace(/^#/, '').slice(0, 2);
  const stackHex = mobileLike && !embedded;
  let displayHex = hex;
  if (embedded && mobileLike) {
    displayHex = `#${compactHex}`;
  }
  const hexEl = info.querySelector('.hex');
  if (stackHex) {
    hexEl.classList.add('hex-stacked');
    renderStackedHex(hexEl, hex);
  } else {
    hexEl.classList.remove('hex-stacked');
    hexEl.textContent = displayHex;
  }
  const nameEl = info.querySelector('.name');
  const resolved = name || nameFromHex(hex) || '';
  nameEl.textContent = resolved;
  if (stackHex) {
    hexEl.style.removeProperty('font-size');
  } else {
    adaptSingleLine(hexEl);
  }
  applyContrastStyles(col, hex);
}

function adaptSingleLine(el, { minScale = 0.75 } = {}) {
  if (!el) return;
  el.style.removeProperty('font-size');
  const parentWidth = el.parentElement ? el.parentElement.clientWidth : el.clientWidth;
  const maxWidth = parentWidth - 8; // padding allowance
  let scale = 1.0;
  const originalSize = parseFloat(getComputedStyle(el).fontSize) || 16;
  while (el.scrollWidth > maxWidth && scale > minScale) {
    scale -= 0.05;
    el.style.fontSize = (originalSize * scale) + 'px';
  }
}

function updateHashFromDOM() {
  const nextHash = currentHashString();
  if (!nextHash) return;
  try {
    const url = new URL(location.href);
    url.hash = nextHash;
    if (HISTORY_MODE === 'replace') {
      history.replaceState(history.state, '', url.toString());
    } else {
      history.pushState(history.state, '', url.toString());
    }
  } catch {
    location.hash = nextHash;
  }
}

function parseHash () {
  const h = location.hash.replace(/^#/, '');
  if (!h) return null;
  const parts = h.split('-').map(normalizeHex6).filter(Boolean);
  return parts.length ? parts : null;
}

function applyShades (shades, overwriteLocked = false) {
  const cols = columns();
  const count = Math.min(cols.length, shades.length);
  for (let i = 0; i < count; i++) {
    const col = cols[i];
    const locked = col.dataset.locked === 'true';
    if (locked && !overwriteLocked) continue;
    setColumnShade(col, shades[i]);
  }
  updateHashFromDOM();
  broadcastStateToParent({ embedded: document.documentElement.classList.contains('embedded') });
  reflowHexLabels();
}

function toggleLock (col) {
  const locked = col.dataset.locked === 'true';
  const next = (!locked).toString();
  col.dataset.locked = next;
  const btn = col.querySelector('.lock-btn');
  if (btn) {
    btn.setAttribute('aria-pressed', next);
    const idx = (parseInt(col.dataset.index, 10) || 0) + 1;
    btn.title = (next === 'true') ? `Unlock (${idx})` : `Lock (${idx})`;
  }
  // Re-apply contrast styling since lock visuals may change
  const hex = col.dataset.shade || '#000000';
  applyContrastStyles(col, hex);
}

function copyToClipboard (text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); resolve(); }
    catch (e) { reject(e); }
    finally { document.body.removeChild(ta); }
  });
}

function generate ({respectLocks = true} = {}) {
  const cols = columns();
  const targets = respectLocks ? cols.filter(c => c.dataset.locked !== 'true') : cols;
  const exclude = new Set();
  if (respectLocks) {
    cols.forEach(c => { if (c.dataset.locked === 'true' && c.dataset.shade) exclude.add(String(c.dataset.shade).toUpperCase()); });
  }
  const toFill = targets.length;
  const newHexes = buildUniqueHexes(toFill, exclude, sessionUsage, 1.0);
  let idx = 0;
  targets.forEach(col => {
    const hex = newHexes[idx++];
    const resolvedName = nameFromHex(hex) ?? '';
    setColumnShade(col, hex, resolvedName);
    bumpUsage(sessionUsage, hex, 1);
  });
  updateHashFromDOM();
  reflowHexLabels();
}

function reflowHexLabels() {
  const embedded = document.documentElement.classList.contains('embedded');
  const stackHex = isMobileLikeViewport() && !embedded;
  columns().forEach(col => {
    const hexEl = col.querySelector('.hex');
    if (!hexEl) return;
    if (stackHex) {
      hexEl.style.removeProperty('font-size');
      return;
    }
    adaptSingleLine(hexEl);
  });
}

function attachEvents (opts = { embedded: false, allowKeyboard: undefined }) {
  const cols = columns();
  const embedded = Boolean(opts.embedded);
  const allowKeyboard = (opts.allowKeyboard === undefined) ? !embedded : Boolean(opts.allowKeyboard);

  // Lock buttons
  cols.forEach(col => {
    const btn = col.querySelector('.lock-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLock(col);
    });
  });

  // Click to copy
  cols.forEach(col => {
    col.addEventListener('click', async (e) => {
      if (e.target.closest && e.target.closest('.lock-btn')) return;
      const hexEl = col.querySelector('.hex');
      const nameEl = col.querySelector('.name');
      const fullHex = col.dataset.shade || hexEl.textContent;
      const mqlCoarse = window.matchMedia ? (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches) : ('ontouchstart' in window);
      // Cleanup prior hints
      if (col._copiedHintTimeout) { clearTimeout(col._copiedHintTimeout); col._copiedHintTimeout = null; }
      const existingHint = col.querySelector('.copied-hint');
      if (existingHint) existingHint.remove();
      try {
        await copyToClipboard(fullHex);
        if (mqlCoarse) {
          const hint = document.createElement('div');
          hint.className = 'copied-hint';
          hint.textContent = 'Copied!';
          nameEl.insertAdjacentElement('afterend', hint);
          col._copiedHintTimeout = setTimeout(() => { hint.remove(); col._copiedHintTimeout = null; }, 1000);
        } else {
          if (col._nameRevertTimeout) { clearTimeout(col._nameRevertTimeout); col._nameRevertTimeout = null; }
          const originalName = nameEl.textContent;
          nameEl.textContent = 'Copied!';
          col._nameRevertTimeout = setTimeout(() => {
            nameEl.textContent = originalName;
            col._nameRevertTimeout = null;
          }, 800);
        }
      } catch {
        if (mqlCoarse) {
          const hint = document.createElement('div');
          hint.className = 'copied-hint';
          hint.textContent = 'Copy failed';
          nameEl.insertAdjacentElement('afterend', hint);
          col._copiedHintTimeout = setTimeout(() => { hint.remove(); col._copiedHintTimeout = null; }, 1200);
        } else {
          if (col._nameRevertTimeout) { clearTimeout(col._nameRevertTimeout); col._nameRevertTimeout = null; }
          const originalName = nameEl.textContent;
          nameEl.textContent = 'Copy failed';
          col._nameRevertTimeout = setTimeout(() => { nameEl.textContent = originalName; col._nameRevertTimeout = null; }, 1000);
        }
      }
    });
  });

  // Keyboard shortcuts
  if (allowKeyboard) {
    const isSpace = (e) => (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar');
    const isEnter = (e) => (e.code === 'Enter' || e.key === 'Enter' || e.code === 'NumpadEnter');
    const handleKeyDown = (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || e.isComposing) return;

      if (isSpace(e) || isEnter(e)) {
        e.preventDefault();
        generate({respectLocks: true});
        return;
      }
      const max = columns().length;
      if (/^[1-9]$/.test(e.key)) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= max) {
          const colsArr = columns();
          const col = colsArr[n - 1];
          if (col) toggleLock(col);
        }
      }
    };
    const handleKeyUp = (e) => {
      if (isSpace(e) || isEnter(e)) {
        // Prevent default button/link activation on keyup when using shortcuts
        e.preventDefault();
      }
    };
    // Capture early to suppress default actions like button "click on Space/Enter"
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
  }

  // Generate button
  const btn = document.getElementById('generateBtn');
  if (btn) btn.addEventListener('click', () => generate({respectLocks: true}));

  // React to hash changes (e.g., back/forward)
  window.addEventListener('hashchange', () => {
    const parts = parseHash();
    if (parts) applyShades(parts, false);
  });

  // Also react to popstate (when history.pushState/replaceState is used)
  window.addEventListener('popstate', () => {
    const parts = parseHash();
    if (parts) applyShades(parts, false);
  });
}

function init () {
  // Treat as embedded when inside an iframe OR when the URL has ?embed=1
  const qp = new URLSearchParams(location.search || '');
  const embedFlag = qp.has('embed') && qp.get('embed') !== '0' && qp.get('embed') !== 'false';
  const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const embedded = inFrame || embedFlag;

  // Determine history mode. Defaults: embedded -> replace (Back leaves page), direct -> push (Back cycles palettes)
  const histRaw = (qp.get('history') || qp.get('hist') || '').toLowerCase();
  if (histRaw) {
    if (['replace', 'r', '0', 'false', 'off'].includes(histRaw)) HISTORY_MODE = 'replace';
    else if (['push', 'p', '1', 'true', 'on'].includes(histRaw)) HISTORY_MODE = 'push';
  } else {
    HISTORY_MODE = embedded ? 'replace' : 'push';
  }

  // Optionally allow keyboard shortcuts even when embedded with ?keys=1 or ?keyboard=1/true
  const allowKeyboard = !embedded || ['1','true','on'].includes((qp.get('keys') || '').toLowerCase()) || ['1','true','on'].includes((qp.get('keyboard') || '').toLowerCase());

  // Capture optional embedding context to include in messages (helps when multiple iframes on a page)
  EMBED_CTX = qp.get('ctx') || qp.get('id') || qp.get('source') || null;

  // Tag root element to enable CSS overrides when embedded
  const root = document.documentElement;
  if (embedded) root.classList.add('embedded');

  // If embedded, ensure nothing is auto-focused (e.g., the Generate button)
  if (embedded) {
    const gb = document.getElementById('generateBtn');
    if (gb) {
      gb.removeAttribute('autofocus');
      if (document.activeElement === gb) {
        try { gb.blur(); } catch { /* noop */ }
      }
    }
  }

  const cols = columns();
  cols.forEach((col, i) => {
    col.dataset.index = String(i);
    col.dataset.locked = col.dataset.locked || 'false';
    if (embedded) col.removeAttribute('title'); // avoid implying copy hint inside iframes
  });

  // Ensure the page is focusable so key events are captured without a click (not when embedded)
  const ensureFocus = () => {
    if (embedded) return;
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    const container = document.querySelector('.container');
    const target = container || document.body;
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    try { target.focus({ preventScroll: true }); } catch { /* noop */ }
    try { window.focus(); } catch { /* noop */ }
    // Fallback: if focus didn't stick, try body on next tick
    requestAnimationFrame(() => {
      const ae = document.activeElement;
      if (!ae || ae === document.body || ae === document.documentElement) {
        try {
          if (!document.body.hasAttribute('tabindex')) document.body.setAttribute('tabindex', '-1');
          document.body.focus({ preventScroll: true });
        } catch { /* noop */ }
      }
    });
  };

  // Try focusing ASAP and also when page becomes fully shown
  if (!embedded) {
    // After DOM is ready
    requestAnimationFrame(ensureFocus);
    // When page loaded (all resources) or restored from bfcache
    window.addEventListener('load', ensureFocus, { once: true });
    window.addEventListener('pageshow', (e) => { if (e.persisted) ensureFocus(); });
    document.addEventListener('visibilitychange', ensureFocus);
    // When the window/tab gains focus, try to ensure key handling works instantly
    window.addEventListener('focus', ensureFocus);
  }

  attachEvents({ embedded, allowKeyboard });

  const fromHash = parseHash();
  if (fromHash) {
    const need = cols.length;
    const base = fromHash.slice(0, need);
    const exclude = new Set(base.map(h => String(h).toUpperCase()));
    const extrasNeeded = Math.max(0, need - base.length);
    if (extrasNeeded > 0) {
      const extraHexes = buildUniqueHexes(extrasNeeded, exclude, sessionUsage, 1.0);
      applyShades([...base, ...extraHexes], true);
    } else {
      applyShades(base, true);
    }
  } else {
    generate({respectLocks: false});
  }

  // Ensure initial contrast styles are applied
  columns().forEach(col => applyContrastStyles(col, col.dataset.shade || '#000000'));
  reflowHexLabels();

  // Expose a tiny helper on window for host pages or dev tools
  try { window.PaletteLinkManager = { buildOpenUrlWithState }; } catch { /* noop */ }
  // Send initial state to parent (for embedded open button wiring)
  broadcastStateToParent({ embedded });
}

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
