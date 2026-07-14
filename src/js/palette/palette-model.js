import { SHADES_OF_BLACK } from '../../data/shades-of-black.js';

export { SHADES_OF_BLACK } from '../../data/shades-of-black.js';

const COMPONENT_TO_NAME = (() => {
  const names = new Map();
  for (const [name, component] of Object.entries(SHADES_OF_BLACK)) {
    const normalized = normalizeComponent(component);
    // The first declared synonym is the stable display name for a component.
    if (normalized && !names.has(normalized)) names.set(normalized, name);
  }
  return names;
})();

function normalizeComponent(value) {
  const component = String(value ?? '').replace(/^#/, '').toUpperCase().padStart(2, '0');
  return /^[0-9A-F]{2}$/.test(component) ? component : null;
}

export function normalizeHex6(value) {
  if (!value) return null;
  const raw = String(value).replace(/^#/, '');
  return /^[0-9A-F]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : null;
}

export function grayscaleComponentFromHex(value) {
  const hex = normalizeHex6(value);
  if (!hex) return null;
  const red = hex.slice(1, 3);
  const green = hex.slice(3, 5);
  const blue = hex.slice(5, 7);
  return red === green && green === blue ? red : null;
}

export function compactGrayscaleLabel(value) {
  const component = grayscaleComponentFromHex(value);
  return component ? `#${component}` : null;
}

export function hexFromName(name) {
  const component = normalizeComponent(SHADES_OF_BLACK[name]);
  return component ? `#${component}${component}${component}` : null;
}

export function nameFromHex(value) {
  const component = grayscaleComponentFromHex(value);
  return component ? (COMPONENT_TO_NAME.get(component) || '') : '';
}
