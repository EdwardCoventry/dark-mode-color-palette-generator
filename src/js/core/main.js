import {
  SHADES_OF_BLACK,
  compactGrayscaleLabel,
  grayscaleComponentFromHex,
  hexFromName,
  nameFromHex,
  normalizeHex6
} from '../palette/palette-model.js';

// Optional context identifier for embedded mode (supplied via ?ctx=... or ?id=...)
let EMBED_CTX = null;

/* ----- helpers ------------------------------------------------------- */
// History behavior: 'push' creates entries for each generation; 'replace' keeps a single entry so Back leaves the page
let HISTORY_MODE = 'push'; // will be set in init() based on embed/flags
let EMBEDDED = false;
let lastHandledHash = null;

function randomShade () {
  // Bias toward darker: square the RNG, cap to 0–63 (quarter range)
  const v   = Math.floor(Math.pow(Math.random(), 2) * 64);
  const hex = v.toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`.toUpperCase();
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
  const lightBg = isLightBackground(hex);

  // Text color for overlay
  info.style.color = lightBg ? '#000' : '#FFF';
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
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches || false;
  const noHover = window.matchMedia?.('(hover: none)').matches || false;
  return coarsePointer || noHover || window.innerWidth <= 700;
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
  const lines = ['#', ...parts].map((part, idx) => {
    const line = document.createElement('span');
    line.className = idx === 0 ? 'hex-line hex-line--hash' : 'hex-line hex-line--component';
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
  const url = new URL(baseUrl, location.origin);
  if (forceReplaceHistory) {
    const existing = (url.searchParams.get('history') || url.searchParams.get('hist') || '').toLowerCase();
    if (!existing) url.searchParams.set('history', 'replace');
  }
  const hash = currentHashString();
  if (hash) url.hash = hash;
  return url.toString();
}

function syncLockIcon (btn, locked) {
  const openIcon = btn?.querySelector('.lock-icon--open');
  const closedIcon = btn?.querySelector('.lock-icon--closed');
  if (!openIcon || !closedIcon) return;
  openIcon.hidden = locked;
  closedIcon.hidden = !locked;
}

function broadcastStateToParent() {
  if (!EMBEDDED) return;
  const payload = {
    type: 'palette:update',
    app: 'color-palette-generator',
    ctx: EMBED_CTX,
    shades: currentShadesHexList(),
    hash: currentHashString(),
    // Suggest adding history=replace when opening the full app, so Back returns to referrer
    suggest: { history: 'replace' }
  };
  // The app supports unknown embedding hosts and sends only public palette state,
  // so a wildcard target is intentional. The host must still validate message origin.
  window.parent.postMessage(payload, '*');
}

function renderColumnHexLabel(col) {
  const hex = normalizeHex6(col.dataset.shade);
  const hexEl = col.querySelector('.hex');
  if (!hex || !hexEl) return;

  const mobileLike = isMobileLikeViewport();
  const stackHex = mobileLike && !EMBEDDED;
  let displayHex = hex;
  if (EMBEDDED && mobileLike) {
    // Compact grayscale-component notation: #VV represents #VVVVVV because R = G = B.
    displayHex = compactGrayscaleLabel(hex);
  }

  if (stackHex) {
    hexEl.classList.add('hex-stacked');
    renderStackedHex(hexEl, hex);
  } else {
    hexEl.classList.remove('hex-stacked');
    hexEl.textContent = displayHex;
  }
  hexEl.setAttribute('aria-label', `Copy ${hex}`);
  hexEl.title = `Copy ${hex}`;

  if (stackHex) {
    hexEl.style.removeProperty('font-size');
  } else {
    adaptSingleLine(hexEl);
  }
}

function setColumnShade (col, value, name = null) {
  const hex = normalizeHex6(value);
  if (!hex || !grayscaleComponentFromHex(hex)) {
    throw new TypeError(`Invalid six-digit grayscale palette color: ${value}`);
  }

  col.style.backgroundColor = hex;
  col.style.backgroundImage = 'none';
  col.dataset.shade = hex;
  const nameEl = col.querySelector('.name');
  const resolved = name || nameFromHex(hex) || '';
  nameEl.textContent = resolved;
  renderColumnHexLabel(col);
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

function persistCurrentPalette(historyMode) {
  if (historyMode === 'none') return;
  if (historyMode !== 'push' && historyMode !== 'replace') {
    throw new TypeError(`Unsupported history mode: ${historyMode}`);
  }

  const nextHash = currentHashString();
  if (!nextHash) return;
  const url = new URL(location.href);
  url.hash = nextHash;
  if (historyMode === 'replace') {
    history.replaceState(history.state, '', url.toString());
  } else if (url.toString() !== location.href) {
    history.pushState(history.state, '', url.toString());
  }
  lastHandledHash = url.hash;
}

function parseHash () {
  const h = location.hash.replace(/^#/, '');
  if (!h) return null;
  const rawParts = h.split('-');
  const parts = rawParts.map(normalizeHex6);
  if (parts.some(hex => !hex || !grayscaleComponentFromHex(hex))) return null;
  return parts;
}

function commitPalette(shades, {
  overwriteLocked = false,
  historyMode = 'none',
  notifyParent = true
} = {}) {
  const cols = columns();
  const count = Math.min(cols.length, shades.length);
  for (let i = 0; i < count; i++) {
    const col = cols[i];
    const locked = col.dataset.locked === 'true';
    if (locked && !overwriteLocked) continue;
    setColumnShade(col, shades[i]);
  }
  reflowHexLabels();
  persistCurrentPalette(historyMode);
  if (notifyParent) broadcastStateToParent();
}

function toggleLock (col) {
  const locked = col.dataset.locked === 'true';
  const next = (!locked).toString();
  col.dataset.locked = next;
  const btn = col.querySelector('.lock-btn');
  if (btn) {
    btn.setAttribute('aria-pressed', next);
    syncLockIcon(btn, next === 'true');
    const idx = (parseInt(col.dataset.index, 10) || 0) + 1;
    btn.title = (next === 'true') ? `Unlock (${idx})` : `Lock (${idx})`;
    btn.setAttribute('aria-label', (next === 'true') ? `Unlock column ${idx}` : `Lock column ${idx}`);
  }
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

function generate ({
  respectLocks = true,
  historyMode = HISTORY_MODE,
  notifyParent = true
} = {}) {
  const cols = columns();
  const targets = respectLocks ? cols.filter(c => c.dataset.locked !== 'true') : cols;
  const exclude = new Set();
  if (respectLocks) {
    cols.forEach(c => { if (c.dataset.locked === 'true' && c.dataset.shade) exclude.add(String(c.dataset.shade).toUpperCase()); });
  }
  const toFill = targets.length;
  const newHexes = buildUniqueHexes(toFill, exclude, sessionUsage, 1.0);
  const nextShades = currentShadesHexList();
  let idx = 0;
  targets.forEach(col => {
    const hex = newHexes[idx++];
    nextShades[Number(col.dataset.index)] = hex;
    bumpUsage(sessionUsage, hex, 1);
  });
  commitPalette(nextShades, { overwriteLocked: true, historyMode, notifyParent });
}

function reflowHexLabels() {
  columns().forEach(renderColumnHexLabel);
}

function completePalette(shades, count) {
  const base = shades.slice(0, count);
  const exclude = new Set(base.map(hex => String(hex).toUpperCase()));
  const extrasNeeded = Math.max(0, count - base.length);
  return extrasNeeded > 0
    ? [...base, ...buildUniqueHexes(extrasNeeded, exclude, sessionUsage, 1.0)]
    : base;
}

function applyPaletteFromLocation() {
  if (location.hash === lastHandledHash) return;
  const parts = parseHash();
  if (!parts) {
    console.error(`Ignored invalid palette hash: ${location.hash}`);
    return;
  }
  lastHandledHash = location.hash;
  commitPalette(completePalette(parts, columns().length), {
    overwriteLocked: true,
    historyMode: 'none',
    notifyParent: true
  });
}

function attachEvents (opts = { embedded: false, allowKeyboard: undefined }) {
  const cols = columns();
  const embedded = Boolean(opts.embedded);
  const allowKeyboard = (opts.allowKeyboard === undefined) ? !embedded : Boolean(opts.allowKeyboard);

  const skipLink = document.querySelector('.skip-link');
  const main = document.getElementById('main-content');
  skipLink?.addEventListener('click', (event) => {
    event.preventDefault();
    if (!main) return;
    main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
  });

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
      const statusEl = col.querySelector('.copy-status');
      const fullHex = col.dataset.shade || hexEl.textContent;
      const mqlCoarse = window.matchMedia?.('(pointer: coarse)').matches || window.matchMedia?.('(hover: none)').matches || false;
      // Cleanup prior hints
      if (col._copiedHintTimeout) { clearTimeout(col._copiedHintTimeout); col._copiedHintTimeout = null; }
      const existingHint = col.querySelector('.copied-hint');
      if (existingHint) existingHint.remove();
      try {
        await copyToClipboard(fullHex);
        if (statusEl) statusEl.textContent = `${fullHex} copied`;
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
        if (statusEl) statusEl.textContent = `Could not copy ${fullHex}`;
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
    const isInteractiveTarget = (target) => Boolean(target?.closest?.(
      'a[href], button, input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="textbox"], [role="checkbox"], [role="radio"], [role="switch"], [role="slider"]'
    ));
    const handleKeyDown = (e) => {
      if (e.isComposing || isInteractiveTarget(e.target)) return;

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
    window.addEventListener('keydown', handleKeyDown);
  }

  // Generate button
  const btn = document.getElementById('generateBtn');
  if (btn) btn.addEventListener('click', () => generate({respectLocks: true}));

  // Both events are needed: popstate covers History API traversal and hashchange
  // covers direct fragment edits. lastHandledHash prevents duplicate processing.
  window.addEventListener('hashchange', applyPaletteFromLocation);
  window.addEventListener('popstate', applyPaletteFromLocation);

  const presentationMedia = window.matchMedia?.('(max-width: 700px), (hover: none), (pointer: coarse)');
  presentationMedia?.addEventListener('change', reflowHexLabels);
}

function init () {
  // Treat as embedded when inside an iframe OR when the URL has ?embed=1
  const qp = new URLSearchParams(location.search || '');
  const embedValue = (qp.get('embed') || '').toLowerCase();
  const embedFlag = qp.has('embed') && !['0', 'false', 'off'].includes(embedValue);
  const inFrame = window.self !== window.top;
  EMBEDDED = inFrame || embedFlag;

  // Determine history mode. Defaults: embedded -> replace (Back leaves page), direct -> push (Back cycles palettes)
  const histRaw = (qp.get('history') || qp.get('hist') || '').toLowerCase();
  if (histRaw) {
    if (['replace', 'r', '0', 'false', 'off'].includes(histRaw)) HISTORY_MODE = 'replace';
    else if (['push', 'p', '1', 'true', 'on'].includes(histRaw)) HISTORY_MODE = 'push';
  } else {
    HISTORY_MODE = EMBEDDED ? 'replace' : 'push';
  }

  // Optionally allow keyboard shortcuts even when embedded with ?keys=1 or ?keyboard=1/true
  const allowKeyboard = !EMBEDDED || ['1','true','on'].includes((qp.get('keys') || '').toLowerCase()) || ['1','true','on'].includes((qp.get('keyboard') || '').toLowerCase());

  // Capture optional embedding context to include in messages (helps when multiple iframes on a page)
  EMBED_CTX = qp.get('ctx') || qp.get('id') || qp.get('source') || null;

  // Tag root element to enable CSS overrides when embedded
  const root = document.documentElement;
  root.classList.toggle('embedded', EMBEDDED);

  const cols = columns();
  cols.forEach((col, i) => {
    col.dataset.index = String(i);
    col.dataset.locked = col.dataset.locked || 'false';
    syncLockIcon(col.querySelector('.lock-btn'), col.dataset.locked === 'true');
    if (EMBEDDED) col.removeAttribute('title'); // avoid implying full-column copy hint inside iframes
  });

  attachEvents({ embedded: EMBEDDED, allowKeyboard });

  const fromHash = parseHash();
  if (fromHash) {
    commitPalette(completePalette(fromHash, cols.length), {
      overwriteLocked: true,
      historyMode: 'replace',
      notifyParent: false
    });
  } else {
    generate({ respectLocks: false, historyMode: 'replace', notifyParent: false });
  }

  // Ensure initial contrast styles are applied
  columns().forEach(col => applyContrastStyles(col, col.dataset.shade || '#000000'));
  reflowHexLabels();

  // Expose a tiny helper on window for host pages or dev tools
  window.PaletteLinkManager = { buildOpenUrlWithState };
  // Send initial state to parent (for embedded open button wiring)
  broadcastStateToParent();
}

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
