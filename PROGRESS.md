# PROGRESS — Phase 5, part C (designed error states)

Code work complete 2026-10-24. Checks: lint ✓ · typecheck ✓ · test 16 files / 266 ✓ · build ✓ (no warnings). Playwright `tests/e2e/error-states.spec.ts` written, not run (needs `npm run dev` on :3000).

## Done

- **One shared error copy module** — `src/lib/scan-error-copy.ts` (client-safe, pure): `scanErrorTitle` (one plain title per code, unknown codes keep a working screen), `scanErrorRetries` (Retry only for transient codes rate_limited / upstream / network_lost — a retry cannot fix not_found / private_or_missing / empty_repo / invalid_input), and `rateLimitResetCopy(resetAt, now?)` → "The limit resets at 06:30 UTC (in 23 minutes)." clock in UTC 24 h, wait rounded up in minutes/hours, past-window copy "Run the scan again now.", unparsable ISO → '' (no extra line). Both error screens and the E2E specs previously duplicated titles; now one source.
- **Rate limited shows the human reset time** — `RateLimitedError.message` no longer embeds the raw ISO stamp (it reads "The shared GitHub rate limit is used up."); the ISO `resetAt` now travels as data: `scan-flight.DesignedErrorRecord` (already did), and `error-response.errorBodyOf` now includes `resetAt` in every API/stream error body (`DesignedErrorBody`), so the scan screen formats it via the copy module and renders it as a `.resetNote` line under the body. `retry-after` behavior unchanged.
- **Network lost is its own state** — `scan-flow.ts`: `NETWORK_LOST_ERROR` (title "The connection dropped.", body "The page could not reach the network. Check the connection, then run the scan again."), `classifyFallbackFailure(error)`: when the fallback fetch throws at network level (browsers throw TypeError exactly for offline / DNS / refused), the scan shows network_lost; any server answer still arrives as the body's designed error, so the two can't collide. The old mislabel ("GitHub is having trouble" for an offline user) is gone.
- **Per-code next actions** — scan screen error view: Retry button ("Try again", torn-down rerun via the existing retry path) only for transient codes; "Scan a different repo" link always; reset line for rate_limited. Report error screen: same rules; "Try again" there goes to `/scan/owner/repo` (pills: filled `--c1` primary + hairline secondary, `report.module.css` `.errorActions` / `.errorPrimary` / `.errorNote`, `scan-screen.module.css` `.resetNote`).
- **Invalid input wired on page URLs too** — `buildScan` now throws `InvalidInputError` before any fetch when owner/repo fail `isValidOwnerRepo` (previously only `/api/repo` validated, so a bad `/r/...` URL collapsed into a 404-flavored not_found).
- **Playwright spec** — `tests/e2e/error-states.spec.ts`, browser-mocked (no token spend): not_found (plain message + "Scan a different repo", and NO dead Retry button), rate_limited ("The limit resets at 06:30 UTC" + whole-minute wait visible; Retry click keeps the same honest limit message), network lost (both stream and fallback aborted → "The connection dropped." + Try again). Existing `tests/e2e/scan-flow.spec.ts` updated for the button's new label ("Try again", was "Retry").
- **Unit tests** — new `tests/unit/scan-error-copy.test.ts` (title style for every code incl. anti-slop regex, retry table, reset-time formatting with fixed clock, unparsable reset), classify test appended to `tests/unit/scan-flow.test.ts`, resetAt-in-body assertion in `tests/unit/api-error-response.test.ts` (message must NOT contain the ISO), invalid-input-no-fetch test in `tests/unit/scan-build.test.ts`.
- Every other designed state was already wired and keeps its copy: truncated tree = info note in the report header ("GitHub cut the file list short…"), empty repo / private / not found / upstream messages unchanged, statsPending "—" with "GitHub is still computing this."

## Known follow-up (pre-existing, out of 5c's remit)

- A settled *error* flight/cache entry lives for the same hour as a scan (`scan-flight` FLIGHT_TTL_MS + the `use cache` profile), so "Try again" within that window can replay the same designed error instantly (the reset-time copy stays self-consistent since `rateLimitResetCopy` handles a past window). Shortening the TTL for error results is a data-layer change better made deliberately.

## Human checks (cannot be verified from code)

- `npm run dev`, then visit `/scan/octo/does-not-exist-123` (not found), a rate-limited repo (add an intentionally drained token or wait), and DevTools → Network → Offline mid-scan (network lost) to eyeball copy, actions and the reset line in light/dark at 320 px.
- Then run `npx playwright test tests/e2e/error-states.spec.ts` against the dev server.

---

# PROGRESS — Phase 5, part A (report page /r/[owner]/[repo])

Code work complete 2026-10-24. Checks: lint ✓ · typecheck ✓ · test 11 files / 215 ✓ · build ✓ (`/r/[owner]/[repo]` is a partial prerender ◐).

## Round 2 — user-reported fixes (2026-10-24). Checks: lint ✓ · typecheck ✓ · test 12 files / 225 ✓ · build ✓

- **Reverse-morph freeze root cause (found + fixed)** — `src/engine/renderer.ts`: anime.js v4's grid `stagger` treats a `[x, y]` `from` as FRACTIONS of the grid (`from[0] * (grid[0] - 1)`, verified in installed `node_modules/animejs/dist/modules/utils/stagger.js:212`), but `morphTo` was passing canvas **pixels** for click-originated morphs. After a single click on the stage every later morph got delays of minutes+ → the "dots don't form the graph, scrolling back does nothing" symptom. New `pixelOriginToFraction(origin, width, height)` (clamped 0..1, degenerate sizes → center) converts at morph time; `pickMorphOrigin` precedence unchanged.
- **Step activation is now direction-agnostic + self-healing** — `src/features/report/story.tsx` + new pure `src/features/report/step-activation.ts` (`pickActiveStepIndex`: nearest step-box center to the viewport middle, min index on ties): the -45% observer band is only a wake trigger, so down/up scrolling decides identically. Dispatch self-heals: when the engine's `getCurrentLayout()` disagrees with the desired step layout, the morph is re-sent instead of being swallowed by the old one-shot `morphedForRef` guard.
- **applyTier no-op rebuild guard** — `renderer.ts`: when the tier's dot budget equals the current field (`min(files.length, maxDots, HARD_DOT_CAP) === dotCount`) the engine now keeps every typed array and any in-flight morph (pointers/effects preserved, only tier stat changes) instead of rebuilding the whole field mid-scroll.
- **Files dots are language-coded (user decision, overrides REFERENCE "Files = fg")** — new shared `src/engine/layouts/language-colors.ts` (`createLanguageIndexer`: top-5 languages by bytes in scan order → c1..c5, unmatched/unknown → 4/c5); `layouts/files.ts` colors every dot by its file's language (opacity stays 0.85; fg only when the scan counts no languages); `layouts/languages.ts` now uses the same indexer (identical behavior, one mapping source).
- **Intro handoff parity** — `intro-overlay.tsx` accepts `scan?` (home page passes the demo scan): grid slot k → file k's language color during the handoff blend, tokens read from :root via `resolveThemeColors` (same parse as the engine); fg fallback when scan absent or has no languages. Scan is captured at mount in a ref — later prop changes never re-boot the intro (keeps exhaust-deps clean).
- **Files legend swatches** — `dot-stage.tsx`: Files view now lists the counted languages with color + % swatches (`styles.legendItem` + `styles.swatch`), only when >1 language is counted. Dev-page Files card copy updated to match (`/dev/engine`: "language-coded colors (c1..c5, fg when no languages)").
- **Tests** — `dot-engine.test.ts`: files layout language-color assertions (palette membership, slot k = file k mapping, ≥2 distinct colors for the 5-language fixture), tiny-data / no-languages (octocat/Hello-World style 1-file scan → all fg), `pixelOriginToFraction` cases (scale, clamp, degenerate size). New `tests/unit/step-activation.test.ts` (nearest center, direction-agnostic round-trip, tie → min index, single step). E2E smoke written, not run: `tests/e2e/report-scroll.spec.ts` (needs `npm run dev` — Playwright reuses the existing server).
- Not yet verified by eye (human, with dev server on): click the stage once, then step down through all four story steps and back up — morphs must stay snappy both ways; check the home intro's final handoff frame vs. the engine's first frame (letters → per-file language colors).

## Round 1 — report page (2026-10-24)

## Done

- **Route** — `src/app/r/[owner]/[repo]/page.tsx`: thin server component. `getScanCached` called directly (same cache as `/api/repo`; designed errors travel as data, never thrown across the cache). Shell prerenders, scan streams in via Suspense (`Loading the report…` fallback). `generateMetadata`: title `owner/repo — Stipple`, description = repo description (designed fallback); error branches get a plain title. Headline block: H1 `{name}.` `.type-display`, dim meta line `owner/name · branch · N stars`, description, and a static truncated note when `flags.truncated`.
- **Story** — `src/features/report/story.tsx`: two columns (steps 1fr, stage 1.5fr, gap 48). Four steps, each min-height 80vh, centered; active opacity 0.25→1 with 0.5s transition; IntersectionObserver `rootMargin: '-45% 0px -45% 0px'` activates the step at mid-screen; the active step's layout is handed to `DotStage.morphTo`, so scrolling back re-fires the previous step and reverses the morph (first activation is tracked, not re-triggered — the engine already starts itself on Files).
- **Sticky stage + mobile** — `report.module.css`: desktop stage sticky `top: 10vh`; under 820px single column, stage `order: -1`, `position: sticky; top: 0; z-index: 2`, 44vh, steps scroll beneath. `dot-stage.module.css` now sizes via `height: var(--stage-h, min(72vh, 580px))`, so the report overrides without touching the home demo.
- **Step headlines (pure, unit-tested)** — `src/features/report/step-headlines.ts`: `formatCount`, `filesPerDot`, `filesHeadline/Body` (plain / truncated `First N files.` / dot-per-N note / empty-tree copy), `topLanguage` + `languagesHeadline/Body` (`{pct}% {Lang}.`, under-1% variant, missing-data variant, runner-up line), `findBusiestWeek` (ties resolved by week date, most recent wins; null when pending/empty) + `activityHeadline/Body` (`Busiest week: N weeks ago.`, this-week/1-week singulars, pending / no-data / all-zero fallbacks), `biggestFolder` (root bucket excluded, alphabetical ties) + `foldersHeadline/Body`, and `buildReportSteps` in story order. Tests in `tests/unit/step-headlines.test.ts`.
- **Health section** — `health-section.tsx`: once at 30% visible; ring 220px (viewBox 120, r 54, stroke 8, round caps, track `--line`, progress `--c1`), dashoffset `339.3 * (1 - score/100)` over 1600ms inOutExpo; score counts up 1400ms outExpo; checklist rows from `scan.health.checks` (README, License, Tests, CI workflow, Contributing guide, Commit in the last 30 days) fade in `translateX -16→0`, stagger 90ms from 300ms, words "Yes"/"Missing". SSR carries final values; reduced motion renders static (no tween run).
- **Numbers** — `numbers-section.tsx`: commits / contributors / packages counters, `clamp(44px, 7vw, 92px)` tabular, count up 1400ms outExpo once. `flags.statsPending` shows "—" + "GitHub is still computing this." — numbers never invented.
- **Dependencies** — `dependencies-section.tsx`: chips pop `scale 0.6→1`, `outElastic(1, 0.7)`, stagger 70ms from 500ms, once; designed copy when no root manifest exists.
- **Reveal hook** — `use-once-when-visible.ts`: one-shot 30% IntersectionObserver + reactive `useReducedMotion` (no setState synchronously in effects).
- **Error screen** — `report-error.tsx`: one plain title per code, the designed message, one next action ("Scan a different repo" → `/`). Full error polish lands in 5c.
- **Shared engine fix** — `dot-stage.tsx` activity legend now says "Commits per week." (was "Files changed per week", contradicting the commits rule). All phases share the same engine as the demo/home.
- anime.js v4 usage verified against the installed 4.5.0 types (`animate()` plain-object targets + `onUpdate`, `stagger(…, { start })`, string eases, `Timer.revert()` cleanup).

## Not started (belongs to later prompts)

- 5b scan flow (progress stream + fallback), 5c designed error states polish, signature scroll-scrubbed timeline (phase 7), share section (phase 6).
- Human check by eye (can't verify from code): real repos, scroll morphs both ways, mobile pin, reduced motion, console cleanliness. Also rerun `PageProps<'/r/[owner]/[repo]'>` migration if desired — explicit `Promise<{owner, repo}>` params typing is used instead (generated route types don't know the new folder until the next dev/build run).

---

# PROGRESS — Phase 3, part B (Stipple boot intro)

Working list against `reference/REFERENCE.md` § "Intro" and its "Real-site changes from the prototype" list. Update after every completed item.

## Done

- **Pointer wake** — `src/engine/effects/pointer-wake.ts`: radius 90 px, push `(1 - d/90) * 5`, spring back `0.06`, damping `0.86` (exact REFERENCE numbers); typed arrays; reset/allocate.
- **Click shockwave** — `src/engine/effects/shockwave.ts`: amp 16, expands to 500 px over 700 ms outQuad, 70 px band with `cos(k/70 * PI/2)` falloff; ring cleanup, reset/destroy.
- **Engine integration** — `src/engine/renderer.ts`: effects ticked in the loop and applied at draw time; wake runs only on the High tier, shockwave on Medium+High (never Low); `triggerShockwave()` public API; pointer move/leave/down listeners; full cleanup in `destroy()`.
- **Intro overlay port** — `src/features/intro/intro-overlay.tsx`: offscreen-canvas word sampling (`gap = max(5, round(fontSize/42))`, grows until < 2,400 pts; radius `gap * 0.36`), word sized to 70% width / 50% height, font wait capped at 1,200 ms; start positions −10%..110% both axes; quadratic control point offset up to ±25% of travel; dot colors cycle c1..c5 by letter index; five-stage timeline with REFERENCE numbers (scatter 400 ms linear, delay 0–300 → done by 700; gather 1,000 ms `outElastic(1, 0.85)` delayed by `tx/W*350` starting at 400; shockwave at 1,800 — amp 14, half diagonal, 600 ms outQuad; handoff at 2,400 — 650 ms inOutExpo, delay by center distance × 200; headline at 2,700 — 700 ms outExpo, translateY 40→0); 240 sampled dots become the Files grid, all other dots fly outward 200–500 px along their center angle and fade; skip via pointerdown/keydown/wheel/touchmove; sessionStorage once-per-session + `?intro=1` force; `visibilitychange` pause/play; DPR-capped full-viewport canvas.
- **Overlay styles** — `src/features/intro/intro-overlay.module.css`: fixed inset-0 overlay (no CLS), dark panel background, skip hint, `.srOnly` status, reduced-motion wordmark fade.
- **Home wiring** — `src/app/page.tsx`: `IntroOverlay` mounted above the page and unmounted on done; headline hidden until intro; demo stage below the form with the "Demo" label.
- **Unit tests** — `tests/unit/intro.test.ts`: mirrored sampling math, grid geometry from stage rect, bezier interpolation, shockwave displacement, session-flag logic, low-tier cap. Suite: 4 files / 95 tests pass.

- **Zero-jump handoff** — fixed 2026-10-23: `DotStage` accepts `onStageElementReady` and reports its real `.stage` panel div; `page.tsx` removed the `display: contents` wrapper (and the phantom `containerRef` comment) and feeds the element to `IntroOverlay` via `stageContainerRef`; the intro reads the rect lazily inside `startIntro` (after the font wait, one task after the sibling effect, so the element is guaranteed to exist) with the prototype geometry as fallback. Grid formulas were already identical to `layouts/files.ts`, so rect + formulas now agree.

- **Canvas font** — fixed 2026-10-23: `resolveCanvasFontFamily()` reads `getComputedStyle(document.body).fontFamily` (next/font's generated name lives in the computed list; `var()` is invalid in canvas font shorthand and `document.fonts.load`); `sample()` and the font wait both use that literal family, with a `sans-serif` fallback.

- **Color/alpha handoff** — fixed 2026-10-23: dot colors are now rgb triples; `resolveFilesColor()` reads body `color` (the token --fg the engine renders Files with). During handoff, grid dots blend letter color → Files color and alpha → 0.85 (`FILES_ALPHA`), so the overlay's last frame matches the engine's first frame; scatter dots unchanged (fade to 0).

- **Real quality tier for the intro** — fixed 2026-10-23: `DotStage` reports the engine (`onEngineReady`, null on unmount); `page.tsx` keeps it in a ref and passes a stable `getTier()` to `IntroOverlay`. The intro reads the tier at sampling time (Low caps the word at 600 points, High/Medium 2,400) and re-reads it live at the 1,800 ms shockwave, so a machine that downgrades mid-intro loses the shockwave too. Caveat: the engine's tier starts at High until its 60-frame measurement finishes (~1 s), so a very fast font load can sample 2,400 dots on a slow machine — the shockwave re-check still lands correctly.

- **Skip handling** — fixed 2026-10-23: `skipRequested` replaces the swallow-prone throttle; every skip listener is detached at the moment of the first skip (no per-event leftovers on the skip path); a skip during the ≤1,200 ms font wait (timeline not yet built) is consumed by `startIntro` right after the timeline exists, instead of being dropped; natural completion still cleans up via `timeline.then`.

- **React-owned overlay unmount** — fixed 2026-10-23 (user-reported runtime `NotFoundError: Failed to execute 'removeChild' on 'Node'` right after the intro): `finish()` no longer calls `overlay.remove()` on the React-rendered overlay before `onDone()`; the page's conditional render (`!introDone && <IntroOverlay/>`) unmounts the overlay through React instead, so `removeChild` always runs against a node React still owns. The reduced-motion wordmark div is self-created (not React-managed) and keeps its own `.remove()`.

- **Intro colors in tokens** — fixed 2026-10-23: added constant tokens `--intro-bg` (#100C24) and `--intro-dim` (#A89FCF) to `tokens.css` (declared once, never overridden by theme blocks — the intro always shows the dark panel per Decisions); `intro-overlay.module.css` uses the tokens. Remaining related exception: `LETTER_COLORS` hexes in `intro-overlay.tsx` (TS needs raw rgb; candidate for `--intro-c1..c5` follow-up).

- **Shared intro math + real tests** — fixed 2026-10-24: intro's pure math extracted to `src/features/intro/intro-math.ts` (computeGap, computeWordFontSize, computeGridFromStage, computePrototypeGrid, gridDotPosition, bezierPoint, ringDisplacement, hexToRgb, LOW_TIER_SAMPLE_POINTS=600 / MAX_SAMPLE_POINTS=2400); `intro-overlay.tsx` imports it (drawFrame, buildDots and the sampling caps no longer duplicate math); `tests/unit/intro.test.ts` tests the real exported functions instead of mirrored copies (new tests: prototype fallback geometry, hexToRgb, real cap constants → 4 files / 99 tests pass). Fixes the TS2440 local/import `Ring` conflict left by the half-applied refactor.

- **Reduced-motion ordering + cleanup** — fixed 2026-10-24: the session/`?intro=1` check now runs BEFORE the reduced-motion branch (flag respected in every path); the reduced path writes the session flag while the fade plays; and its new cleanup function stops both fade tweens and removes the self-created wordmark div if the overlay unmounts mid-fade.

- **Page interactive after handoff** — fixed 2026-10-24: a marker tween fires when the timeline reaches 3250 ms (the moment the last grid dot lands: 2400 + 200 delay + 650) and sets `pointer-events: none` on the overlay, so clicks/keys reach the page while the headline rise finishes; the overlay is still unmounted by React at timeline end.

- **Screen-reader status audible** — fixed 2026-10-24: the `role="status"` "Loading Stipple" span now renders OUTSIDE the `aria-hidden` overlay (sibling fragment), so screen readers announce it; hidden subtrees are never announced.

- **Resize replay mid-intro** — fixed 2026-10-24: the intro setup split into `setupCanvas()` (re-measures + re-transforms) and `buildTimelineAndDots()` (re-sample → rebuild dots → rebuild the whole five-stage timeline, pausing the previous one); a 300 ms-debounced resize listener replays instantly like the prototype; skipped before timeline exists and after done; listener + timer removed in cleanup.

- **Click origin wired into morphs** — fixed 2026-10-24: `DotEngine` records every pointerdown as canvas-local `lastClick` (on all tiers, stored even where the shockwave is skipped); new exported helper `pickMorphOrigin(optionsOrigin, lastClick)` resolves the stagger origin — explicit option > last click `[x, y]` > `'center'` — and `morphTo` uses it, so post-intro morphs ripple out from the click point (REFERENCE "After the intro"; anime v4 `stagger` accepts `[x, y]` coords natively). Unit tests added (4 files / 103 tests pass).

## Half-done (in fix order)

All 13 items are now fixed:
1. ~~Zero-jump handoff is broken~~ → Done.
2. ~~Canvas font never applies~~ → Done.
3. ~~No color/alpha handoff~~ → Done.
4. ~~Low tier is not real~~ → Done (sampling-time read + live shockwave re-check).
5. ~~Skip handling leaks~~ → Done (`skipRequested` + bulk detach + pre-timeline skip).
6. ~~Reduced-motion ordering~~ → Fixed 2026-10-24 (session check first, flag written, cleanup fn).
7. ~~Overlay lingers over the page~~ → Fixed 2026-10-24 (`pointer-events: none` at 3250 ms).
8. ~~Status hidden from screen readers~~ → Fixed 2026-10-24 (span outside the overlay).
9. ~~Hardcoded hexes~~ → Fixed 2026-10-23 (`--intro-bg` / `--intro-dim` tokens; LETTER_COLORS hexes in TSX remain a documented exception).
10. ~~Fixture imported from tests/~~ → Fixed 2026-10-24 (generator moved to `src/lib/demo/scan-fixture.ts`; `tests/fixtures/scan-fixture.ts` re-exports it).
11. ~~No resize handling~~ → Fixed 2026-10-24 (300 ms-debounced instant replay).
12. ~~Click origin not wired~~ → Fixed 2026-10-24 (`pickMorphOrigin` + engine `lastClick` + tests).
13. ~~Tests mirror, not import~~ → Fixed 2026-10-24 (`intro-math.ts`; tests import the real functions).

## Not started

- **Checkpoint B verification by the human**: side-by-side against `reference/stipple-intro-reference.html` (cannot be verified from code): intro spells "stipple" in ~3.4 s, skip works, plays once per session, ends exactly on the home grid with no jump, wake + shockwave after the intro, reduced-motion fade.
- **Console-error and fps spot check** on the real site (human, DevTools).
- ~~Re-run `npm run build` after the fixes~~ → done 2026-10-24: build passes clean (static `/`, `/dev/engine`, `/_not-found`; PPR for `/scan`), no warnings.

Round 1 build-mode stop (after 5 items): lint ✓ · typecheck ✓ · test 4 files / 95 ✓ · build ✓.

Round 2 build-mode (items 13 + 6–12): lint ✓ · typecheck ✓ · test 4 files / 103 ✓ · build ✓. Phase 3b code work is complete; only the human Checkpoint B verification remains.

## Errors from the checks

Fixed 2026-10-23 (build-mode round 1): all 3 typecheck errors collapsed by capturing `overlayRef.current` through the optional chain at removal and typing the anime.js v4 function-based `delay` params as `Target` (imported type from 'animejs', per the installed 4.5.0 `FunctionValue` = `(target?: Target, index?, targets?, prevTween?) => T`); both lint `prefer-const` errors fixed (`gr`, `gap`). `npm run lint`, `npm run typecheck` now pass clean; `npm run test` → 4 files / 95 tests pass.

Baseline when this file was created (for the record):
```
typecheck (3, intro-overlay.tsx): TS18047 'overlay' possibly null (365); TS2322 gather delay (450); TS2322 handoff delay (474)
lint (2): prefer-const intro-overlay.tsx:176 'gr'; intro.test.ts:243 'gap'
```
