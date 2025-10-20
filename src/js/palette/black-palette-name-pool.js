// Convert a dictionary value (two-digit hex) to full 6-digit grayscale hex, e.g., '0A' -> '#0A0A0A'

import {BLACK_TO_BLACK} from "../../data/black-colors.js";

// Re-export the name pool for consumers that need to iterate candidates
export { BLACK_TO_BLACK } from "../../data/black-colors.js";

export function hexFromName(name) {
  const v = BLACK_TO_BLACK[name];
  if (!v) return null;
  const comp = String(v).replace('#', '').toUpperCase().padStart(2, '0').slice(0, 2);
  return `#${comp}${comp}${comp}`;
}

// Given a hex, return the matching name if it corresponds to a known grayscale entry; otherwise null
export function nameFromHex(hex) {
  if (!hex) return null;
  const raw = hex.startsWith('#') ? hex.slice(1) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const rr = raw.slice(0, 2).toUpperCase();
  const gg = raw.slice(2, 4).toUpperCase();
  const bb = raw.slice(4, 6).toUpperCase();
  if (rr !== gg || rr !== bb) return null; // not a grayscale hex
  // collect all names whose component matches RR
  const matches = [];
  for (const [name, comp] of Object.entries(BLACK_TO_BLACK)) {
    if (rr === String(comp).toUpperCase().padStart(2, '0').slice(0, 2)) {
      matches.push(name);
    }
  }
  if (!matches.length) return null;
  // choose uniformly among all matching names so synonyms appear over time
  const idx = Math.floor(Math.random() * matches.length);
  return matches[idx] || null;
}
