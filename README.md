# Color Palette Generator

A tiny grayscale color palette generator built with Vite.

## Project structure

- `color-palette-generator.html` — Main app page (loads JS modules from `src/js`)
- `index.html` — Redirects to `/color-palette-generator.html?embed=1`
- `src/`
  - `styles.css` — shared styles
  - `js/`
    - `pages/color-palette-generator.js` — palette page boot (loads core)
    - `data/shades-of-black.js` — grayscale names → hex component + helpers
    - `components/header.js` — <site-header> web component
    - `components/footer.js` — <site-footer> web component
    - `core/main.js` — app core (generation, events, keyboard, copy)
- `vite.config.js` — multi-page config (index + color-palette-generator)
- `netlify.toml` — SPA fallback to `color-palette-generator.html`

## Run locally (http://localhost:5175)

```cmd
npm install
npm run dev
```

Open http://localhost:5175/color-palette-generator.html

## Build and preview

```cmd
npm run build
npm run preview
```

- Preview: http://localhost:5175/color-palette-generator.html
- Build output: `dist/` (contains both `index.html` and `color-palette-generator.html`)

## Keyboard/UX

- Space: regenerate unlocked columns
- Keys 1–4: toggle lock for each column
- Click a color: copies the hex to clipboard
- Note: When embedded (`?embed=1`), keyboard shortcuts are disabled by default. Enable them with `?keys=1` (e.g., `?embed=1&keys=1`).
