# Architecture Remediation Plan

Status: Complete

Last updated: 2026-07-14

Completed: 2026-07-14

## Purpose

Make the palette generator's existing architecture reliable at its real boundaries—full-page history, embedded-host communication, keyboard operation, responsive presentation, accessibility, build verification, and maintainability—without introducing a frontend framework or changing the product's intentionally compact design.

The Vite application in the repository root remains the source of truth. The canonical app, redirect wrapper, and embed wrapper remain supported surfaces.

## Product decisions and non-goals

### Preserve compact grayscale notation in embeds

Embedded layouts intentionally display a grayscale color such as `#323232` as `#32` when space is constrained. In this application every generated color is grayscale, so its red, green, and blue byte components are identical:

```text
compact component: #32
full CSS color:     #323232
relationship:       R = G = B = 0x32
```

`#32` is an application-specific compact grayscale-component notation, not a standalone CSS hex color. The UI does not need explanatory copy, but implementation names, comments, tests, and developer documentation must describe the notation accurately. Clipboard output and URL state must continue using the full six-digit value.

### Keep the architecture small

- Keep Vite and browser-native JavaScript.
- Do not introduce React, a state-management library, a router, or a component framework.
- Keep the canonical `/apps/color-palette-generator` route and supported embed aliases.
- Preserve palette locking, copying, keyboard generation, URL sharing, and compact mobile presentation.
- Do not replace failures with silent fallbacks. Expected compatibility branches must be explicit and testable; unexpected failures must be surfaced.

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete and verified
- `[!]` Blocked; include the blocking reason beside the item

An item is complete only when its implementation and stated verification are both complete.

## Baseline

Verified on 2026-07-14 against the current worktree:

- `npm run build` passes.
- `npm test -- --reporter=verbose` passes: 2 files, 6 tests.
- Browser proof shows Back navigation becomes trapped because history traversal writes a new history entry.
- Browser proof shows an embedded host receives the initial `palette:update` but no update after Generate.
- Browser proof shows Enter on a focused lock button regenerates the palette instead of activating the lock.
- Browser proof shows crossing the mobile breakpoint after load does not rebuild the compact/stacked hex presentation.
- The current HTML contains duplicate `palette-generator-title` IDs.
- Click-to-copy columns are not keyboard-focusable.
- CI does not unconditionally run the local build and test suite.

## Execution order

Work in the order below. Tests should expose a defect before or alongside its fix. Avoid broad rewrites that combine behavior changes with cosmetic cleanup.

### Phase 1 — Protect the behavioral contract with regression tests

Goal: make the known failures reproducible and prevent regressions while the state flow is refactored.

- [x] **TEST-001: History traversal regression**
  - Generate at least two palettes in full-page push-history mode.
  - Verify one Back operation restores the immediately previous palette.
  - Verify repeated Back operations continue moving backward rather than adding entries or becoming trapped.
  - Verify Forward restores the next palette.
  - Verify navigation restores the URL palette exactly, regardless of the current lock state.

- [x] **TEST-002: Embedded update regression**
  - Load the application in an iframe with a parent message listener.
  - Verify exactly one initial `palette:update` after initialization.
  - Generate a new palette and verify a new message contains the rendered full six-digit shades and matching hash.
  - Verify `ctx` is preserved.

- [x] **TEST-003: Native keyboard semantics**
  - Focus a lock button and activate it with Enter and Space.
  - Verify the lock changes and the palette does not regenerate.
  - Focus Generate and verify native Enter/Space activation generates exactly once.
  - Verify the global generation shortcut does not intercept links, buttons, form controls, or editable content.
  - Verify numeric lock shortcuts still work outside editable and interactive controls.

- [x] **TEST-004: Responsive representation changes**
  - Cross the mobile breakpoint after initial render.
  - Verify full-page labels change between single-line and stacked representations as intended.
  - Verify embedded mobile labels use compact grayscale-component notation.
  - Verify returning to desktop restores the full six-digit label.

- [x] **TEST-005: Accessibility structure**
  - Assert IDs are unique.
  - Assert the main region has one unambiguous accessible heading.
  - Assert every copy action is keyboard operable.
  - Assert lock state remains available through `aria-pressed` and a meaningful accessible name.

Acceptance criteria:

- The tests fail against the known broken behavior for the expected reason.
- Tests use the production entry page or real iframe boundary where browser behavior matters.
- Unit-level tests remain focused on pure palette and state helpers.

### Phase 2 — Centralize palette transitions and repair history

Goal: separate rendering from persistence so applying URL state cannot create new history.

- [x] **STATE-001: Introduce one explicit palette transition path**
  - Define a transition API that receives the next shades and explicit options for lock handling, history behavior, and parent notification.
  - Supported history behavior must be explicit: `push`, `replace`, or `none`.
  - Keep full six-digit uppercase grayscale values as canonical state.

- [x] **STATE-002: Make rendering side-effect boundaries explicit**
  - Rendering columns must not implicitly mutate browser history.
  - History persistence must not implicitly re-render.
  - Parent notification must occur from the completed canonical state, not from partially updated DOM.

- [x] **STATE-003: Repair Back/Forward behavior**
  - User generation uses the configured push/replace behavior.
  - `popstate`/hash-driven navigation renders with `history: none`.
  - Avoid processing one traversal twice through overlapping `hashchange` and `popstate` handlers.
  - Navigation overwrites locked columns because it restores an explicitly selected historical state; it does not silently rewrite the requested URL to preserve current locks.

- [x] **STATE-004: Keep share URLs stable**
  - Initial no-hash generation produces one canonical hash without redundant history entries.
  - Parsed hashes are normalized to four full grayscale values.
  - Invalid URL state is handled explicitly and visibly during development; do not conceal parser defects with malformed string fallbacks.

Acceptance criteria:

- TEST-001 passes in Chromium.
- Existing generation and locking tests remain green.
- Back/Forward never increases `history.length` as a consequence of traversal.

### Phase 3 — Repair the embed contract

Goal: make the iframe output a dependable stream of canonical palette state.

- [x] **EMBED-001: Notify after every committed palette change**
  - Send after initialization.
  - Send after Generate.
  - Send after applying externally selected URL/history state when the rendered palette changes.
  - Do not send duplicate messages for one transition.

- [x] **EMBED-002: Document the message contract**
  - Document `type`, `app`, `ctx`, `shades`, `hash`, and `suggest`.
  - State that `shades` and `hash` always use full six-digit values even when the visual label uses compact notation.
  - Document the target-origin decision. If `*` remains necessary for generic embedding, record why the outbound data is considered non-sensitive.

- [x] **EMBED-003: Name compact representation accurately**
  - Replace ambiguous internal names such as `compactHex` with terminology such as `grayscaleComponent` or `compactGrayscaleLabel`.
  - Add a concise code comment describing `#VV` as the shared byte component of `#VVVVVV`.
  - Update tests so they assert the intentional relationship, not merely a two-digit string shape.

Acceptance criteria:

- TEST-002 passes.
- Parent messages contain full canonical values.
- The embed still fits its constrained mobile layout and visually displays `#VV`.

### Phase 4 — Restore native keyboard and accessibility behavior

Goal: preserve shortcuts without overriding the semantics of interactive elements.

- [x] **A11Y-001: Scope global shortcuts safely**
  - Ignore events originating in buttons, links, inputs, textareas, selects, editable content, and elements with interactive roles.
  - Do not suppress native keyup behavior globally.
  - Ensure Generate fires once per native activation.

- [x] **A11Y-002: Fix document structure**
  - Remove the duplicate heading ID.
  - Use one page-level heading and an unambiguous controls label.
  - Preserve the skip link and confirm its focus target.

- [x] **A11Y-003: Make copy controls keyboard operable**
  - Prefer semantically interactive markup or provide correct role, focusability, activation keys, and accessible naming.
  - Announce copy success/failure without temporarily destroying the color's accessible name.
  - Keep the full six-digit value available to assistive technology even when the visual embed label is compact.

- [x] **A11Y-004: Simplify focus management**
  - Remove forced focus behavior that competes with autofocus, skip links, or user-selected controls.
  - Retain only focus behavior with a demonstrated product requirement and a regression test.

Acceptance criteria:

- TEST-003 and TEST-005 pass.
- Lock and copy actions are usable with keyboard-only navigation.
- No global shortcut prevents native control activation.

### Phase 5 — Make responsive rendering reactive

Goal: keep the visual representation correct after rotation, resizing, zoom-related layout changes, and embed/full-page mode changes.

- [x] **RESP-001: Observe the presentation breakpoint**
  - Use `matchMedia` change listeners or one appropriately scoped resize mechanism.
  - Re-render label representation only when the relevant mode changes.
  - Avoid an unrestricted resize loop that repeatedly performs layout reads and writes.

- [x] **RESP-002: Separate canonical value from visual label**
  - Keep `data-shade`, clipboard output, URL state, and embed messages canonical.
  - Derive desktop, stacked-mobile, and compact-embed labels from canonical state.
  - Ensure accessible text exposes the canonical value.

Acceptance criteria:

- TEST-004 passes in both directions across the breakpoint.
- Copying after any resize still produces the full six-digit color.

### Phase 6 — Consolidate styling and remove dead indirection

Goal: establish one source of truth for styling and palette-domain helpers.

- [x] **CLEAN-001: Move page styling into `src/styles.css`**
  - Remove the duplicated inline stylesheet from `color-palette-generator.html`.
  - Resolve conflicting rules deliberately, especially `.lock-btn`, `.color-col .info`, mobile hex labels, and Generate button theming.
  - Visually verify full-page desktop, full-page mobile, embedded desktop, and embedded mobile layouts.

- [x] **CLEAN-002: Consolidate palette helpers**
  - Keep one implementation of name-to-hex and hex-to-name behavior.
  - Decide and document whether synonym selection is stable or randomized.
  - Move pure generation/normalization helpers out of the auto-booting DOM module so they can be tested without importing the application.

- [x] **CLEAN-003: Remove empty shell components**
  - Delete the empty header/footer custom elements and imports unless a concrete host contract requires them.
  - If retained for an external contract, document that contract and avoid modules whose only behavior is clearing their own contents.

- [x] **CLEAN-004: Reduce hidden failure handling**
  - Audit broad `catch` blocks and `catch { /* noop */ }` paths.
  - Keep compatibility handling only for known, testable browser limitations.
  - Surface unexpected redirect, URL construction, clipboard, and messaging failures appropriately.
  - Do not introduce fallback behavior merely to make a broken primary path appear successful.

Acceptance criteria:

- One authoritative stylesheet controls the page.
- One authoritative palette helper module controls conversions and naming.
- Removed modules have no remaining imports or documented runtime contract.
- Build output and the four primary visual modes remain correct.

### Phase 7 — Make CI and documentation trustworthy

Goal: ensure a green workflow means the repository itself builds and passes its tests.

- [x] **CI-001: Add an unconditional repository verification job**
  - Run `npm ci`.
  - Run `npm run build`.
  - Run `npm test`.
  - Keep the shared Playwright smoke job as an additional conditional check rather than the only substantive job.

- [x] **CI-002: Make external smoke dependencies reproducible**
  - Pin or otherwise deliberately version the shared smoke runner.
  - Retain artifacts on failure.
  - Ensure the workflow cannot report full verification solely because the shared runner variable is absent.

- [x] **DOC-001: Correct the README**
  - Document the current index and embed redirects.
  - Correct source paths.
  - Describe the Netlify rewrite arrangement accurately.
  - Document canonical and local development routes.
  - Add the compact grayscale notation developer note.

- [x] **DOC-002: Correct naming and stale comments**
  - Correct `color-pallet-generator` where compatibility permits.
  - Remove placeholder comments that no longer describe the source.
  - Keep comments focused on decisions and non-obvious constraints.

Acceptance criteria:

- A clean checkout can install, build, and test without depending on untracked local files.
- The unconditional CI job passes.
- README paths and routing statements match the production build and Netlify configuration.

## Final verification gate

The remediation is complete only when all of the following are satisfied:

- [x] Every item above is complete or explicitly removed from scope with a recorded reason.
- [x] `npm run build` passes.
- [x] `npm test` passes.
- [x] Shared smoke testing passes when configured.
- [x] Manual or automated browser proof covers:
  - canonical full-page route;
  - root redirect;
  - embed redirect and iframe mode;
  - Generate, lock, copy, Back, and Forward;
  - desktop and mobile breakpoint transitions;
  - keyboard-only operation.
- [x] Production build output contains the expected HTML entries and assets.
- [x] Netlify redirects and noindex behavior are verified on the deployed surface before release.
- [x] No unrelated pre-existing worktree changes are included in remediation commits.

## Completion evidence

Verified on 2026-07-14:

- Fresh dependency installation completed with `npm ci`; Chromium availability completed with `npx playwright install chromium`.
- The development toolchain was upgraded to patched current releases: Vite 8.1.4, Vitest 4.1.10, jsdom 29.1.1, and Playwright 1.61.1.
- Package engines, CI, and Netlify builds are aligned on a Vite-compatible Node 22 runtime.
- `npm audit --audit-level=moderate` reports zero vulnerabilities.
- `npm run build` passes and produces the three HTML entries plus hashed CSS/JavaScript assets.
- `npm test -- --reporter=verbose` passes: 4 files and 17 tests.
- `npm run smoke` passes against the production build and canonical application document.
- Workflow YAML parses successfully, and the unconditional CI job's install, browser-install, build, and test commands pass locally from the fresh dependency state. Remote CI will execute on the next normal push; no push or deploy was performed as part of this plan.
- `npm run app-map` passes and refreshes both documented screens.
- Browser proof covers local root, canonical-development, pretty-development, and embed wrappers; push and replace history; Back and Forward; locked-state restoration; host messages; native and global keyboard behavior; copy accessibility; and live breakpoint transitions.
- Visual QA covers full-page desktop, full-page mobile, embedded desktop, and embedded mobile. The title/hint contrast issue discovered during QA was corrected and recaptured.
- The currently deployed Netlify surface is healthy. Live checks verified the canonical route, root/canonical/embed robots metadata, embed `X-Robots-Tag`, and the legacy 301 route. The local implementation remains intentionally undeployed pending explicit release authorization.
- No remediation commit was created, so unrelated pre-existing worktree changes were not included in a commit.

## Suggested commit boundaries

Keep the work reviewable with coherent commits:

1. Regression tests for history, embed messaging, keyboard semantics, responsive changes, and accessibility structure.
2. Central palette transition and history repair.
3. Embed notification and compact grayscale documentation.
4. Keyboard/accessibility and responsive rendering fixes.
5. CSS/helper/component cleanup.
6. CI and documentation corrections.

Each commit should pass the relevant focused checks. The final branch must pass the complete build, test, smoke, and browser-verification gate.
