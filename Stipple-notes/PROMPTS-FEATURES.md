# Prompts for the Pulse and Structure features, done by the contributor

Owner of this work: the contributor. Read `reference/FEATURES-SPEC.md` first. It defines everything.

**Rules for every prompt:** a new agent session each time. The agent never starts the dev server (you run `npm run dev`), never runs `git commit`, `git push`, `git merge` or `git reset`. After each prompt: `npm run lint`, `typecheck`, `build`, `test`, look at the site, then commit and push (commands in `MASTER-PLAN.md` sections 3 and 4).

**Do not touch:** `src/styles/**`, fonts, `src/app/page.tsx`, the intro, the background, the wordmark, the scan screen. Those belong to the owner's redesign work.

## Order, models and effort

| # | Prompt | Model | Effort | Plan first |
|---|---|---|---|---|
| F0 | Read and confirm | Luna or any | Low | no |
| F1 | Data: Pulse stats and Structure stats | Codex Terra | High | yes |
| F2 | Engine: dot pool and Pulse layout | Codex Terra or Gemini | High | yes |
| F3 | Engine: Structure layout and zoom | Codex Terra or Gemini | High | yes |
| F4 | Wire both views into the report page | Gemini | Medium | no |
| F5 | Share summary lines | Luna | Low | no |
| F6 | Edge cases and tests | Terra or Luna | Medium | no |

If a model fails twice on a prompt, switch model. If two models fail, split the prompt in smaller pieces.

## F0. Read and confirm (Low)

```
First run git branch --show-current. It must say main. If it does not, stop and tell me.
Read AGENTS.md, DESIGN.md, reference/REFERENCE.md and reference/FEATURES-SPEC.md fully. Do not write code.
Reply in under 250 words: what the two features are, which files my branch owns and which it must not touch, the dot pool idea, and any question you need answered before F1.
```

## F1. Data (High, plan first)

```
First run git branch --show-current. It must say main, else stop. Never run git commit, git push, git merge or git reset.
Read AGENTS.md, reference/REFERENCE.md and reference/FEATURES-SPEC.md. Plan first, then wait for my go-ahead.

Server side only, no UI.
1. Extend the one Scan type in src/lib/types/scan.ts with `pulse` and `structure` exactly as in FEATURES-SPEC.md. Keep the old `activity` field.
2. Verify in the official GitHub REST docs that stats/commit_activity returns, per week, the week start, a total and 7 daily counts. Use the daily counts to build `pulse.days` (364 entries, oldest first). No new API calls. Keep the existing 202 retry and statsPending behavior. Empty data gives pulse = null and the UI says "No activity data yet". Never invent numbers.
3. src/server/scan/pulse.ts: pure functions for lastCommit, activeWeeks, longestStreakWeeks, busiestWeekday, totalCommits, topWeeksShare, status, pattern, headline and subline, following the rules in the spec.
4. src/server/scan/structure.ts: classify(path), codeSplit, largest (excluding lockfiles and minified files), maxDepth, topFolders.
5. Update the normalizers, the demo fixture generator in tests/fixtures (365-day data with realistic bursts and gaps, and a nested folder tree), and the JSON route.
6. Unit tests for every rule: each status and pattern, streaks, edge weeks, every classify class and odd paths, the empty cases.
Do not start the dev server. Run lint, typecheck, build, test. Tell me exactly what to curl to see the new fields for expressjs/express and octocat/Hello-World.
```

## F2. Engine: dot pool and Pulse layout (High, plan first)

```
First run git branch --show-current. It must say main, else stop. Never run git commit, git push, git merge or git reset.
Read AGENTS.md, reference/REFERENCE.md and reference/FEATURES-SPEC.md. Plan first, then wait for my go-ahead.

Engine only (src/engine/**). Do not touch styles or the page.
1. The dot pool: pool size = max(file dots, 364). Every layout returns a target for every dot. Unused dots have alpha 0 and wait at the stage center. Dots appearing from the center and dots hiding must morph with the same stagger as before. Confirm every anime.js v4 import against https://animejs.com/documentation and the installed types.
2. The Pulse layout: 52 columns by 7 rows (Sunday to Saturday), levels by commit count exactly as in the spec (size and alpha), accent color, a ring for the last commit day. Pure function, unit-tested (counts, bounds, no NaN, the level boundaries, fewer than 52 weeks of history).
3. Month label and weekday label data for the view (positions and text), as pure data the UI draws.
4. The one-time left-to-right reveal after the morph, and the High-tier shimmer wave. Low tier and reduced motion: none.
5. Hover or focus lookup for a day: returns the date and commit count (use the existing spatial grid).
Update the dev page (/dev/engine) with a Pulse button. Do not start the dev server. Run lint, typecheck, build, test. Tell me what to look at on /dev/engine.
```

## F3. Engine: Structure layout and zoom (High, plan first)

```
First run git branch --show-current. It must say main, else stop. Never run git commit, git push, git merge or git reset.
Read AGENTS.md, reference/REFERENCE.md and reference/FEATURES-SPEC.md. Plan first, then wait for my go-ahead.

Engine only (src/engine/**), plus pure helpers.
1. groupAt(focusPath): from the file paths, return the next folder segment below the focus path, with counts, plus "(files here)". More than 12 children: the 11 biggest and "N other folders". Pure and unit-tested (root, deep focus, trailing slashes, no subfolders, 13+ children).
2. The Structure layout: spiral clusters per group with labels and counts (as the old Folders layout), for the current focus path.
3. Zoom: zoomTo(path) and up(): the dots of the chosen group spread and regroup by their subfolders (900 ms easeInOutExpo, stagger 4 ms from the clicked cluster). The engine exposes the breadcrumb (array of path parts) and a callback so the UI can show it. A folder with no subfolders does nothing.
4. Hover or focus on a dot: path, language and size.
5. Keyboard support in the engine API: focusNext, focusPrev, enter, escape, backspace.
Update /dev/engine with a Structure button and zoom. Do not start the dev server. Run lint, typecheck, build, test. Tell me what to look at.
```

## F4. Wire both views into the report page (Medium)

```
First run git branch --show-current. It must say main, else stop. Never run git commit, git push, git merge or git reset.
Read AGENTS.md, reference/REFERENCE.md and reference/FEATURES-SPEC.md.

Minimal UI, using existing tokens only. The redesign branch restyles this later, so do NOT edit src/styles/**, fonts or global CSS, and add no new animations beyond the layout morphs.
1. New files src/features/report/pulse-view.tsx and structure-view.tsx, each with its own CSS module.
2. The story steps become Files, Languages, Pulse, Structure. Headlines and sub lines from the stats, with unit tests.
3. Pulse view: the calendar on the stage, month and weekday labels, the legend, the hover card, a visually hidden table, arrow-key navigation, "No activity data yet" when pulse is null.
4. Structure view: breadcrumb, the labeled clusters as real focusable buttons, Back, hover card, and the side panel with "Where the code lives" (text and percent), "Biggest files" and "Depth". Also a visually hidden table.
5. Register the two views in the existing view list with the smallest possible change to the report page files.
Do not start the dev server. Run lint, typecheck, build, test. Tell me which URLs to open (use /r/expressjs/express and /r/octocat/Hello-World).
```

## F5. Share summary lines (Low)

```
First run git branch --show-current. It must say main, else stop. Never run git commit, git push, git merge or git reset.
Read AGENTS.md and reference/FEATURES-SPEC.md.
Add the two lines to the README summary block builder: "Pulse: Active, last commit 3 days ago, commits in 31 of 52 weeks" and "Structure: 62% source, 18% tests, deepest folder 7 levels", built from the Scan (use the real values; skip a line if its data is null). Keep the builders pure with unit tests. Do not touch the badge, the card or the preview image. Do not start the dev server. Run lint, typecheck, build, test.
```

## F6. Edge cases and tests (Medium)

```
First run git branch --show-current. It must say main, else stop. Never run git commit, git push, git merge or git reset.
Read AGENTS.md, reference/REFERENCE.md and reference/FEATURES-SPEC.md.
Check and fix both features for: stats still computing (202), no commits in the last year, a repo with a single file and no folders, a repo with 13 or more subfolders in one folder, very deep nesting, a huge repo with a truncated tree (nixpkgs), file names with odd characters, reduced motion, the Low quality tier, and keyboard-only use. Add one Playwright test for Pulse and one for Structure (zoom in, breadcrumb, back). Give me a table of every case, what happened, and what you fixed. Do not start the dev server. Run lint, typecheck, build, test.
```

## When you finish your turn

1. `git pull`, then the four checks again (`lint`, `typecheck`, `build`, `test`), then `git push`
2. Message the owner: "Baton passed. F0 to F6 done and pushed." Every push to `main` goes live, so only push when all four pass
