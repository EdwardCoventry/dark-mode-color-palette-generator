# Color Palette Generator

A small Vite application for generating, locking, sharing, and copying grayscale palettes. The same application supports a full-page presentation and a space-constrained embed presentation.

## Source of truth

- `color-palette-generator.html` — canonical application document
- `src/js/core/main.js` — DOM integration, transitions, history, events, and embed notification
- `src/js/palette/palette-model.js` — pure grayscale normalization and naming helpers
- `src/data/shades-of-black.js` — names mapped to grayscale byte components
- `src/styles.css` — authoritative application styling
- `index.html` — root redirect wrapper
- `embed.html` — embed redirect wrapper
- `vite.config.js` — multi-page production build
- `netlify.toml` — production rewrites, redirects, headers, and publish configuration

When several names share a byte component, the first declaration in `shades-of-black.js` is the stable display name. Generation varies colors rather than randomly changing synonyms for the same color.

## Routes

The canonical production URL is:

```text
https://dark-mode-color-palette-generator.netlify.app/apps/color-palette-generator
```

Netlify internally rewrites that route to `/color-palette-generator.html`. `/` redirects in the browser to the canonical route, while the `/embed/...` aliases use `embed.html` to preserve query/hash state and add `embed=1`.

During Vite development, use `/color-palette-generator.html`. The repository's `apps/color-palette-generator/index.html` redirects the pretty route to that development entry.

## Install and run

```powershell
npm ci
npx playwright install chromium
npm run dev
```

The development command uses the shared local-development helpers under `../../scripts`. The preferred port is 5406, but the helper can select another available port.

Build and preview:

```powershell
npm run build
npm run preview
```

The production build publishes `dist/` and contains `index.html`, `embed.html`, `color-palette-generator.html`, and hashed assets.

## Palette state and history

Canonical palette state always consists of four uppercase six-digit grayscale values and is stored in the URL fragment:

```text
#000000-0A0A0A-323232-FFFFFF
```

- Full-page mode defaults to push history. Each Generate action adds one entry, so Back and Forward traverse palettes.
- Embed mode defaults to replace history so palette changes do not trap navigation inside an iframe.
- `?history=replace` or `?hist=r` forces replace mode.
- `?history=push` or `?hist=p` forces push mode.

History traversal renders the selected URL state without writing a new history entry. Locks control generation only; they do not override a palette explicitly selected through Back or Forward.

## Compact grayscale notation

Every generated color is grayscale, so its red, green, and blue byte components are identical. In a constrained mobile embed, the visual label uses the shared component byte:

```text
#32       compact grayscale-component label
#323232   canonical six-digit CSS color (R = G = B = 0x32)
```

`#32` is application-specific compact notation rather than a standalone CSS hex value. It is visual only. Clipboard output, URL state, accessible labels, and embed messages always use `#323232`.

## Keyboard and accessibility

- Space or Enter generates when focus is not on an interactive or editable element.
- Number keys 1–4 toggle the corresponding lock outside interactive/editable elements.
- Generate, lock, copy, and skip-link controls retain native keyboard behavior.
- Copy controls expose the full canonical color to assistive technology, including in compact embed mode.

Embedded mode disables global shortcuts by default. Enable them with `?keys=1` or `?keyboard=1`; native focused controls continue to work regardless.

## Embed message contract

An embedded application sends one message after initialization and one after every committed palette change:

```js
{
  type: 'palette:update',
  app: 'color-palette-generator',
  ctx: 'optional-host-context',
  shades: ['#000000', '#0A0A0A', '#323232', '#FFFFFF'],
  hash: '000000-0A0A0A-323232-FFFFFF',
  suggest: { history: 'replace' }
}
```

Pass host context with `?ctx=...`, `?id=...`, or `?source=...`. The app supports arbitrary embedding hosts and therefore posts public palette state using target origin `*`; receiving hosts must validate `event.origin` before trusting messages.

## Verification

```powershell
npx playwright install chromium
npm run build
npm test
npm run smoke
```

The test suite includes pure palette-model tests, DOM integration tests, browser regressions for History API behavior, iframe messaging, keyboard semantics, responsive representation, accessibility structure, and the palette/background smoke workflow.

CI always installs, builds, and tests the repository. The additional shared smoke job runs when both `PLAYWRIGHT_SMOKE_REPO` and a pinned `PLAYWRIGHT_SMOKE_REF` repository variable are configured.

## Architecture work

The tracked implementation and verification checklist is [docs/architecture-remediation-plan.md](docs/architecture-remediation-plan.md).
