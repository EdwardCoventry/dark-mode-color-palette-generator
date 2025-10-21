import { SHADES_OF_BLACK, hexFromName, nameFromHex } from '../palette/black-palette-name-pool.js';

/* ----- helpers ------------------------------------------------------- */
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

function setColumnShade (col, hex, setName = true, name = null) {
  const info = col.querySelector('.info');
  col.style.background = hex;
  col.dataset.shade = hex;
  info.querySelector('.hex').textContent = hex;
  if (setName) {
    info.querySelector('.name').textContent = name ?? nameFromHex(hex) ?? '';
  }
  applyContrastStyles(col, hex);
}

function updateHashFromDOM () {
  const shades = columns().map(c => (c.dataset.shade || '#000000').slice(1));
  location.hash = shades.join('-');
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
    setColumnShade(col, shades[i], true);
  }
  updateHashFromDOM();
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

  // Determine targets and exclusion set
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
    setColumnShade(col, hex, true, resolvedName);
    bumpUsage(sessionUsage, hex, 1);
  });

  updateHashFromDOM();
}

function attachEvents (opts = { embedded: false }) {
  const cols = columns();

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
      const hex = hexEl.textContent;
      const prev = nameEl.textContent;
      try {
        await copyToClipboard(hex);
        nameEl.textContent = 'Copied!';
      } catch {
        nameEl.textContent = 'Copy failed';
      } finally {
        setTimeout(() => { nameEl.textContent = prev; }, 800);
      }
    });
  });

  // Keyboard shortcuts (skip when embedded)
  if (!opts.embedded) {
    const handleKeyDown = (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || e.isComposing) return;

      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
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
    // Listen on window to catch global key events when the window is focused
    window.addEventListener('keydown', handleKeyDown);
  }

  // Generate button
  const btn = document.getElementById('generateBtn');
  if (btn) btn.addEventListener('click', () => generate({respectLocks: true}));

  // React to hash changes (e.g., back/forward)
  window.addEventListener('hashchange', () => {
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
  }

  attachEvents({ embedded });

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
}

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
