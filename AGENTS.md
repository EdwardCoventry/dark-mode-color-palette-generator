# Agents

- This repo serves the color palette generator site and its embed surface.
- Source of truth is the Vite app in the repo root: `src/`, `index.html`, `embed.html`, and `color-palette-generator.html`.
- Dev: `npm run dev`. Build: `npm run build`. Preview: `npm run preview`.
- Netlify publishes `dist/` using `netlify.toml`.
- Shared Netlify helper scripts live at `C:\Users\Edward\Code\scripts\netlify`; prefer `pwsh C:\Users\Edward\Code\scripts\netlify\netlify.ps1 ...` for deploy inspection, retries, branch builds, and branch status checks.

## Local verification and GitHub usage

Run routine checks locally before pushing. Follow [.github/LOCAL_CI.md](.github/LOCAL_CI.md)
and `pwsh -NoProfile -File .github/local-checks.ps1`. GitHub runs are manual-only:
do not dispatch or rerun them unless the user explicitly requests hosted execution.
Preserve release and publishing commands; a push or tag must not launch cloud CI.
