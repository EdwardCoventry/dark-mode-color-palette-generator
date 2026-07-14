import { describe, expect, it } from 'vitest';
import {
  compactGrayscaleLabel,
  grayscaleComponentFromHex,
  hexFromName,
  nameFromHex,
  normalizeHex6
} from '../src/js/palette/palette-model.js';

describe('palette model', () => {
  it('normalizes canonical six-digit values', () => {
    expect(normalizeHex6('0a0a0a')).toBe('#0A0A0A');
    expect(normalizeHex6('#FFFFFF')).toBe('#FFFFFF');
    expect(normalizeHex6('#ABC')).toBeNull();
  });

  it('derives compact grayscale-component notation from a full color', () => {
    expect(grayscaleComponentFromHex('#323232')).toBe('32');
    expect(compactGrayscaleLabel('#323232')).toBe('#32');
    expect(compactGrayscaleLabel('#123456')).toBeNull();
  });

  it('uses one stable name conversion contract', () => {
    expect(hexFromName('Obsidian')).toBe('#0A0A0A');
    expect(nameFromHex('#0A0A0A')).toBe('Obsidian');
    expect(nameFromHex('#123456')).toBe('');
  });
});
