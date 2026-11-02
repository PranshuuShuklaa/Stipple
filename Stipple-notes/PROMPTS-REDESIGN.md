# Prompts for the redesign (the new look), done by the owner

Owner of this work: the site owner. Read `reference/BRIEF.md` and `reference/REDESIGN-SPEC.md` first. `reference/redesign-reference.html` is the approved design: open it in a browser to see the goal.

**Rules for every prompt:** a new agent session each time, a Gemini model for anything with screenshots, the agent never starts the dev server, never runs `git commit`, `git push`, `git merge` or `git reset`. After each prompt: `npm run lint`, `typecheck`, `build`, `test`, look at the site, then commit and push (commands in `MASTER-PLAN.md` sections 3 and 4).

**Do not touch:** `src/lib/types/scan.ts`, `src/server/**`, `src/engine/layouts/**`. Those belong to the contributor's features work.

## Order

| # | Prompt | Model | Effort | When |
|---|---|---|---|---|
| R0 | Does the agent see the skills? | Gemini | Low | now |
| R1 | Audit the current site | Gemini | Medium | now |
| R2 | Background, fonts, readable text | Gemini | High | now |
| R3a | Name entrance, living wordmark, headline | Gemini | High | now |
| R3b | Sphere, clean zone, shockwave, language colors | Gemini | High | now |
| R5 | Scan screen | Gemini | Medium | now |
| | **Wait until the contributor has pushed F0 to F6 to `main`, then run `git pull`** | | | |
| R4 | Report page with Pulse and Structure | Gemini (Terra for logic) | High | after the merge |
| R6 | Phones, speed, reduced motion | Gemini | High | after R4 |
| Q1 to Q4 | Accessibility, performance, edge repos, pre-deploy | see below | | last |

### The VERIFY ROUTINE (the agent repeats this itself. It is pasted into the prompts below)

```
VERIFY ROUTINE
1. Confirm http://localhost:3000 responds. I run npm run dev myself. Do not start it.
2. playwright-cli open http://localhost:3000
3. For each size run playwright-cli resize <w> <h>, then playwright-cli screenshot --filename=.playwright-cli/<name>-<w>.png. Sizes: 390 844, 768 1024, 1440 900.
4. playwright-cli console error  (read console errors)
5. Scroll test: playwright-cli mousewheel 0 800, take a screenshot, repeat until the bottom.
6. Look at the screenshots. Compare them with reference/redesign-reference.html (open it with playwright-cli too and take the same screenshots). List the 3 worst differences or problems. Fix them. Repeat up to 3 rounds.
7. playwright-cli close
Never save screenshots outside .playwright-cli/.
```

### R0. Does the agent see the skills? (effort Low)

```
List every skill you can load, with its name and one line description. Do not load any and do not change anything.
```
You want to see `design-taste-frontend` and a Playwright skill. If missing, ask: "Where do you look for skills?" and send me the answer.

### R1. Look at the current site (effort Medium)

```
First run git branch --show-current. It must say main. If it does not, stop and tell me. Never run git commit, git push, git merge or git reset.
Read AGENTS.md, DESIGN.md, reference/BRIEF.md and reference/REDESIGN-SPEC.md. Load the design-taste-frontend skill (redesign mode) and the playwright-cli skill.
Open http://localhost:3000 with playwright-cli (I run the dev server, do not start it). Also open reference/redesign-reference.html in the browser. Take screenshots at 390, 768 and 1440 wide of: my home page, the scan screen (/scan/expressjs/express), the report (/r/expressjs/express) at the top, middle and bottom, and the share section.
Write reference/AUDIT.md: for each page, the biggest differences between my site and the approved prototype, what to keep, and the order of work. Do not change any source file. Do not start the dev server.
```
Check yourself: open `reference/AUDIT.md`. Does it list real problems (flat background, fonts, text)? Commit: skip, nothing changed in code (the file is ignored).

### R2. Background, fonts and readable text (effort High, plan first)

```
First run git branch --show-current. It must say main. If it does not, stop and tell me. Never run git commit, git push, git merge or git reset.
Read AGENTS.md, DESIGN.md, reference/BRIEF.md, reference/REDESIGN-SPEC.md and reference/AUDIT.md. Load design-taste-frontend and playwright-cli. Plan first, then wait for my go-ahead.

Build only these three things, to match reference/redesign-reference.html exactly (use the numbers in REDESIGN-SPEC.md, port to anime.js v4, check the docs and the installed types for every import):
1. Fonts: Bricolage Grotesque for display, Instrument Sans for text, loaded with next/font on the <html> element. Update the type scale.
2. The fixed full-screen stippled glow background canvas with film grain, as one reusable component used by every page. Include the quality tiers, reduced-motion fallback and stopping when the tab is hidden.
3. The readability system: quiet zones around text (the glow dims near any element marked as a quiet zone) and the text halo. Mark the home page text, the report text sections and the footer.
Replace the old plain solid background everywhere. Do not change the intro, the engine or any logic.
Then run the VERIFY ROUTINE and fix the top 3 problems for up to 3 rounds. Do not start the dev server. Run lint, typecheck, build, test.
(paste the VERIFY ROUTINE here)
```
Check yourself: the background is glowing dots, not flat. Text is easy to read, even when your mouse is over it. Fonts look like the prototype. Commit: `git status`, `git add -A`, `git commit -m "redesign: background, fonts, readability"`.

### R3a. The name entrance, living wordmark and headline (effort High)

```
First run git branch --show-current. It must say main. If it does not, stop and tell me. Never run git commit, git push, git merge or git reset.
Read AGENTS.md, DESIGN.md, reference/BRIEF.md and reference/REDESIGN-SPEC.md. Load design-taste-frontend and playwright-cli.
Match reference/redesign-reference.html for the opening of the home page (numbers in REDESIGN-SPEC.md, port to anime.js v4, check the docs and installed types):
1. The name entrance on page load ("Name entrance on page load" section): the "stipple" wordmark pops up huge in the center with the letters springing in, a shockwave ring, then it glides to the top left. Click or any key skips it. Reduced motion: no entrance. If the old dots intro exists, do not delete it: add a constant INTRO_STYLE = "name" or "dots" and use "name".
2. The living wordmark: a color wave through the letters from the glow gradient, a gentle bob per letter (CSS translate property), and the logo of five dots orbiting a pulsing center dot. It never stops, and stops for reduced motion.
3. The kinetic headline (letters rise through a mask and push away from the cursor, text selectable and readable by screen readers), and the sub text and form fading in after the name lands.
Keep the real input and Scan button working. Run the VERIFY ROUTINE, fix the top 3 problems for up to 3 rounds. Do not start the dev server. Run lint, typecheck, build, test.
(paste the VERIFY ROUTINE here)
```
Check yourself: reload the page. The name pops up in the middle, then flies to the top left. After that the headline appears. The name's colors keep flowing. Commit: `git commit -m "redesign: name entrance and wordmark"`.

### R3b. The sphere, the clean zone, the shockwave and the language colors (effort High)

```
First run git branch --show-current. It must say main. If it does not, stop and tell me. Never run git commit, git push, git merge or git reset.
Read AGENTS.md, DESIGN.md, reference/BRIEF.md and reference/REDESIGN-SPEC.md. Load design-taste-frontend and playwright-cli.
Match reference/redesign-reference.html:
1. The dot sphere (960 points) with pointer tilt. On Scan, 240 dots fly into the Files grid. Keep the real Scan button and the real scan flow working exactly as before, only add the animation to it.
2. The clean zone: the page glow must not show behind the sphere or its file grid ("Clean zone around the sphere" in the spec).
3. The click shockwave: a click anywhere sends a ring across the page ("Click shockwave" in the spec).
4. The fixed color for every language (the map in REDESIGN-SPEC.md). After the scan data is known, the glow, the sphere bands, the logo dots, the wordmark wave and the report dots all use the colors of the repo's real top languages, weighted by percentage, cross-fading over 1800 ms.
Run the VERIFY ROUTINE, fix the top 3 problems for up to 3 rounds. Do not start the dev server. Run lint, typecheck, build, test.
(paste the VERIFY ROUTINE here)
```
Check yourself: no glow behind the ball. Click anywhere: a ring travels. Scan two different repos: the colors differ. A CSS-heavy repo glows cyan. Commit: `git commit -m "redesign: sphere, shockwave, language colors"`.

### R5. The scan screen and the page-to-page feel (effort Medium)

```
First run git branch --show-current. It must say main. If it does not, stop and tell me. Never run git commit, git push, git merge or git reset.
Read AGENTS.md, DESIGN.md, reference/BRIEF.md and reference/REDESIGN-SPEC.md. Load design-taste-frontend and playwright-cli.
Restyle the scan screen (/scan/[owner]/[repo]) and the error states to match: same background, fonts and quiet zones. The scan sweep stays tied to the real stages. When the scan finishes, the glow recolors to the repo's language colors (1800 ms) before the report opens, and the colors carry over to the report route so there is no jump back to the default colors.
Run the VERIFY ROUTINE on /scan/expressjs/express and an error case (/r/nobody-xyz/does-not-exist-123). Fix the top 3 problems for up to 3 rounds. Do not start the dev server. Run lint, typecheck, build, test.
(paste the VERIFY ROUTINE here)
```
Commit: `git commit -m "redesign: scan screen"`.

### R4. The animated report page, with Pulse and Structure (effort High, plan first)

**Do this only after the contributor has pushed F0 to F6 to `main` and you have run `git pull`** (`MASTER-PLAN.md` section 5, turn 3).

```
First run git branch --show-current. It must say main. If it does not, stop and tell me. Never run git commit, git push, git merge or git reset.
Read AGENTS.md, DESIGN.md, reference/BRIEF.md, reference/REDESIGN-SPEC.md and reference/FEATURES-SPEC.md. Load design-taste-frontend and playwright-cli. Plan first, then wait for my go-ahead.
Check git log --oneline -15 shows the contributor's feature commits (Pulse and Structure). If it does not, stop and tell me.
Redesign the report page (/r/[owner]/[repo]) to match the "Report page" section of reference/redesign-reference.html and REDESIGN-SPEC.md: huge repo name title, the pinned stage with the stagger morphs, step text that dims and brightens, the health ring drawing itself, the checklist rows resolving one by one, counting numbers, popping dependency chips, and the share section with the badge pop. The four story views are now Files, Languages, Pulse and Structure. Style the two new views to fit the same world: the Pulse calendar (month and weekday labels, the legend, the hover card, the last-commit ring, language-accent dots), and the Structure explorer (breadcrumb, folder labels, the zoom, the "Where the code lives" panel, "Biggest files", "Depth"). All text sections are quiet zones. Only edit styling and animation. Do not change data code, src/server/**, src/lib/types/scan.ts or src/engine/layouts/**. If a layout needs a change, tell me instead.
Run the VERIFY ROUTINE on /r/expressjs/express, /r/facebook/react and /r/octocat/Hello-World. Fix the top 3 problems for up to 3 rounds. Do not start the dev server. Run lint, typecheck, build, test.
(paste the VERIFY ROUTINE here)
```
Check yourself: scroll slowly, all four views regroup, the Pulse calendar reveals, you can click into folders and come back, the ring draws once. Commit: `git commit -m "style: report page redesign"`.

### R6. Phones, speed and reduced motion (effort High)

```
First run git branch --show-current. It must say main. If it does not, stop and tell me. Never run git commit, git push, git merge or git reset.
Read AGENTS.md, DESIGN.md, reference/BRIEF.md and reference/REDESIGN-SPEC.md. Load playwright-cli.
Final redesign pass. Check 390, 768, 1440 and 1920 wide, light and dark theme, and prefers-reduced-motion (emulate it, or tell me exactly how I should check it). Check that the quality tiers work: the glow background and the sphere must drop to Low settings when the frame rate is poor. Check nothing keeps running when the tab is hidden. Fix what you find and give me a table of what you checked, what failed, and what you fixed.
Do not start the dev server. Run lint, typecheck, build, test.
```
Commit: `git commit -m "redesign: mobile and performance"`.

---

## Final prompts (after R6)

### Q1. Accessibility (Gemini or Terra, effort High)

```
First run git branch --show-current. It must say main. If it does not, stop and tell me. Never run git commit, git push, git merge or git reset.
Read AGENTS.md, DESIGN.md and reference/REDESIGN-SPEC.md. Load playwright-cli. Accessibility pass on every page, including the Pulse calendar and the Structure explorer. Check keyboard order and visible focus, landmarks and headings, names for graphics and canvases, contrast in light and dark (text on the glow must always pass AA), the visually hidden tables, the name entrance, and the full prefers-reduced-motion experience. Fix everything you find, run an automated check (axe) and give me a table of issues found and fixed. Do not start the dev server. Run lint, typecheck, build, test.
```

### Q2. Performance (Terra, effort High)

```
First run git branch --show-current. It must say main. If it does not, stop and tell me. Never run git commit, git push, git merge or git reset.
Read AGENTS.md, DESIGN.md and reference/REDESIGN-SPEC.md. Load playwright-cli. Performance pass: bundle size, unneeded client components, font loading, layout shift, long tasks, memory growth after many view switches and zooms, and frame cost of the glow background, the sphere, the shockwave, the Pulse shimmer and the Structure zoom on each quality tier. Do not remove features, optimize them. Tell me exactly how I should run Lighthouse (mobile and desktop) and what fps check I should do, because you cannot measure on my machine. Do not start the dev server. Run lint, typecheck, build, test.
```

### Q3. Edge repos (Luna or Terra, effort Medium)

```
First run git branch --show-current. It must say main. If it does not, stop and tell me. Never run git commit, git push, git merge or git reset.
Read AGENTS.md and reference/FEATURES-SPEC.md. Load playwright-cli. Check these scans end to end and fix problems: expressjs/express, facebook/react, octocat/Hello-World, NixOS/nixpkgs (huge), a repo that does not exist, a private repo, a repo with rate limit reached (simulate if you can), and offline in the middle of a scan. Each must show a designed state with plain wording and a next action, in both themes and on a phone size. Add or update Playwright tests for the five most important cases and give me a table of results. Do not start the dev server. Run lint, typecheck, build, test.
```

### Q4. Pre-deploy check (Luna, effort Low)

```
Do not change code. Check and report as a table: git status shows no ignored or secret file staged, AGENTS.md and DESIGN.md and reference/ are not tracked (git ls-files), no token or .env value in any committed file, npm run build passes, GITHUB_TOKEN and NEXT_PUBLIC_SITE_URL are read only from the environment, and README.md matches what exists (features, routes, setup).
```
