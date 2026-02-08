import { chromium } from 'playwright';
import { createServer } from 'vite';

const parseRgb = (value) => {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(value);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
};

const hexToRgb = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16)
});

const assertMatches = (hex, rgb, index) => {
  if (!/^#[0-9A-F]{6}$/i.test(hex)) {
    throw new Error(`Column ${index + 1} hex is invalid: "${hex}"`);
  }
  const expected = hexToRgb(hex.toUpperCase());
  if (!rgb) {
    throw new Error(`Column ${index + 1} missing computed background`);
  }
  if (expected.r !== rgb.r || expected.g !== rgb.g || expected.b !== rgb.b) {
    throw new Error(`Column ${index + 1} background ${rgb.r},${rgb.g},${rgb.b} does not match ${hex}`);
  }
};

const defaultOptions = {
  clicks: 12,
  width: 1280,
  height: 800
};

export async function runPaletteUiCheck(options = {}) {
  const { clicks, width, height } = { ...defaultOptions, ...options };
  const server = await createServer({
    root: process.cwd(),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 4173, strictPort: true }
  });

  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0] || 'http://127.0.0.1:4173/';
  const targetUrl = `${baseUrl.replace(/\/$/, '')}/color-palette-generator.html`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => {
      const hex = document.querySelector('.color-col .hex');
      return hex && hex.textContent && hex.textContent.trim().length > 0;
    });

    const readPalette = async () => page.$$eval('.color-col', (cols) => cols.map((col) => ({
      hex: (col.querySelector('.hex')?.textContent || '').trim(),
      bg: getComputedStyle(col).backgroundColor
    })));

    let snapshot = await readPalette();
    snapshot.forEach((col, idx) => assertMatches(col.hex, parseRgb(col.bg), idx));

    for (let i = 0; i < clicks; i += 1) {
      await page.click('#generateBtn');
      await page.waitForTimeout(150);
      snapshot = await readPalette();
      snapshot.forEach((col, idx) => assertMatches(col.hex, parseRgb(col.bg), idx));
    }

    return { clicks, columns: snapshot.length };
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith('run-palette-ui.js')) {
  runPaletteUiCheck()
    .then((result) => {
      console.log(`UI check passed (${result.columns} columns, ${result.clicks} clicks).`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
