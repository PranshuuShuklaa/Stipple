# Stipple master plan (main only, taking turns)

One branch, `main`. Two people. **One person works at a time and passes a "baton".** Follow this file top to bottom.

## 0. The idea in 6 lines

1. Everyone works on `main`. There are no other branches and no pull requests
2. Only the person who holds the baton works. The other waits, or works on something that touches no shared files
3. Before you start: `git pull`. When you finish: four checks, commit, `git pull`, `git push`, then tell the other person "baton passed"
4. Every push to `main` goes live on Vercel. So push only when `lint`, `typecheck`, `build` and `test` all pass, and push at the end of your turn, not in the middle
5. Never edit the other person's files (table in section 5). If you must, message them first
6. If the live site breaks, roll back on Vercel (section 7), then fix calmly

## 1. Files: what to add and where

| File | Put it in |
|---|---|
| `AGENTS.md`, `DESIGN.md`, `.gitignore`, `.env.example` | `C:\PROJECTS\Stipple\` (replace) |
| `reference\` folder (all 7 files) | `C:\PROJECTS\Stipple\reference\` |
| `MASTER-PLAN.md`, `PROMPTS-REDESIGN.md`, `PROMPTS-FEATURES.md`, `CONTRIBUTOR-GUIDE.md`, `HANDOFF.md`, `PROJECT.md` | `C:\PROJECTS\Stipple-notes\` |

Delete the old `REDESIGN.md`, `PROMPTS.md`, `WORKFLOW.md`. Then in `C:\PROJECTS\Stipple` run `git status`: `AGENTS.md`, `DESIGN.md` and `reference` must **not** be listed.
The private files are not in Git. **Back them up** (cloud drive or a private repo) and **send your partner** the private ones: `AGENTS.md`, `DESIGN.md`, `reference`, `CONTRIBUTOR-GUIDE.md`, `PROMPTS-FEATURES.md`, `MASTER-PLAN.md`.

## 2. One-time setup

**Owner**
1. GitHub, repo **Stipple**, **Settings, Collaborators, Add people**: her username
2. If you turned on "require a pull request" for `main` earlier, turn it off (Settings, Branches, edit or delete the rule), or she cannot push
3. Check tools: `node -v` (22 or higher), `playwright-cli --help`, Taste Skill installed:
   ```
   npm install -g @playwright/cli@latest
   playwright-cli install --skills
   npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
   ```
4. Make sure your `main` is saved and pushed:
   ```
   cd C:\PROJECTS\Stipple
   git switch main
   git status
   git pull
   ```
   `git status` must say "working tree clean". If not, commit first: `git add -A`, `git commit -m "chore: save work"`, `git push`

**Contributor:** `CONTRIBUTOR-GUIDE.md` sections 1 to 6.

## 3. The baton routine (every turn)

**Start your turn**
```
cd C:\PROJECTS\Stipple
git switch main
git pull
npm install
npm run test
```
Everything must pass before you begin. If something is red, tell the other person, do not build on top of it.
Then open your three windows (section 6) and run your prompts.

**After each prompt:** `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test`, look at the site, then a local commit:
```
git status
git add -A
git commit -m "feat: short message"
```
`git status` must not list `.env.local`, `AGENTS.md`, `DESIGN.md`, `reference`, `.playwright-cli`.

**End your turn** (when your prompts for this turn are all done and green)
```
git pull
npm run lint
npm run typecheck
npm run build
npm run test
git push
```
Then send: "Baton passed. Done: F1 to F3. Pushed. Next for you: F4." Vercel starts a production deploy. Check it says Ready (section 7).

**Receiving the baton:** do "Start your turn" above.

## 4. Git commands you need

| What | Command |
|---|---|
| Which branch am I on? | `git branch --show-current` (must say `main`) |
| Get the latest | `git pull` |
| Save locally | `git add -A` then `git commit -m "feat: message"` |
| Share | `git push` |
| See what changed | `git status`, `git log --oneline -8` |
| Throw away changes in one file (not committed) | `git restore <file>` |
| Unstage a file | `git restore --staged <file>` |
| Throw away all uncommitted work (no undo) | `git reset --hard HEAD` |
| Undo a commit already pushed | `git revert <commit id>`, then `git push` |

Commit messages start with `feat:` (new), `fix:` (bug), `style:` (look), `test:`, `chore:` (setup).

**"Updates were rejected" when you push:** the other person pushed first. Run `git pull`, then `git push`. If Git says there are conflicts:
1. `git status` lists files as "both modified". Open one
2. You see `<<<<<<<`, `=======`, `>>>>>>>`. Your editor shows buttons: **Accept Current**, **Accept Incoming**, **Accept Both**. Choose what is right, delete the marker lines
3. `git add <file>` for each, then `git commit` (accept the default message)
4. Run the four checks, then `git push`
5. To cancel the merge: `git merge --abort`. If it is a file you do not understand, ask the other person
Conflicts should be rare because you take turns and own different files.

**Never:** `git push --force`, commit a token or `.env.local`, `git add` an ignored file, push when a check is red.

## 5. The schedule (who does what, in this order)

| Turn | Who | Does | Why this order |
|---|---|---|---|
| 1 | Owner | `PROMPTS-REDESIGN.md`: R0, R1, R2, R3a, R3b, R5 | The look of the shell: glow, fonts, name entrance, hero, scan screen. Touches no data code |
| 2 | Contributor | `PROMPTS-FEATURES.md`: F0 to F6 | Data, engine and the two new views. Needs no new look yet |
| 3 | Owner | `PROMPTS-REDESIGN.md`: R4, R6, then Q1 to Q4 | R4 styles the two new views, so it must come after turn 2 |
| 4 | Owner | README, GIF, final deploy check | |

**Want to go faster?** Turns 1 and 2 can run at the same time. It still works on `main` because you edit different files. The only extra rule: `git pull` right before every `git push`, and push small and often.

Who owns which files:

| Area | Owner (redesign) | Contributor (features) |
|---|---|---|
| `src/styles/**`, fonts, background, wordmark, intro, home, scan screen, visual layer of the report | yes | no |
| `src/lib/types/scan.ts`, `src/server/**` | no | yes |
| `src/engine/layouts/**`, dot pool, zoom logic | no | yes |
| New `pulse-view.tsx`, `structure-view.tsx` and their CSS modules | styles them in R4 | creates them |
| `tests/**` for the features | no | yes |

## 6. Every work session: three windows

1. FreeLLMAPI, if you use it: `cd C:\Users\hp\freellmapi`, `npm run dev`
2. The site: `cd C:\PROJECTS\Stipple`, `npm run dev` (open `http://localhost:3000`)
3. Your agent in `C:\PROJECTS\Stipple` (opencode needs `$env:FREELLMAPI_API_KEY = Read-Host "Paste unified key"` first)

Rules for every prompt: new agent session each time, the agent never starts the dev server, never runs `git commit`, `git push`, `git merge` or `git reset`.

**Taste Skill:** you never run it. The design prompts say "Load design-taste-frontend". The agent reads `reference/BRIEF.md`, builds, screenshots at three widths, and fixes its 3 worst problems, up to 3 rounds.
**Playwright CLI:** the robot browser. Try it once yourself while the site runs:
```
playwright-cli open http://localhost:3000 --headed
playwright-cli screenshot --filename=.playwright-cli/test.png
playwright-cli close
```
The agent also uses `resize 390 844`, `mousewheel 0 800` and `console error`. `playwright-cli show` lets you watch. Screenshots stay in `.playwright-cli/`, which Git ignores. Use Gemini for every prompt that needs screenshots, Codex Terra for hard logic, Luna and free models for small jobs. If a model is busy, press Esc and switch.

## 7. Deploy and rollback

Vercel builds `main` after every push.
1. Vercel project, **Deployments**: the newest must say **Ready**. If it fails, open it and read the first red error
2. `NEXT_PUBLIC_SITE_URL` must be your real address. If you changed it, **Redeploy**
3. After the last turn, test the live site on PC and phone: `/`, scan `expressjs/express`, all four report views, the share section, `/api/repo/expressjs/express`, badge, card and preview image
4. **If the live site breaks:** Vercel, **Deployments**, open the last good one, use **Instant Rollback** or **Promote to Production** (the button name can vary). Then fix the code on your PC and push again
5. Rotate the GitHub token before it expires (calendar reminder)

## 8. If something breaks

| Problem | What to do |
|---|---|
| Push rejected | `git pull`, then `git push` |
| Conflict | Section 4 |
| Build red after `git pull` | The other person pushed something broken. Tell them. Do not build on it |
| `npm run dev` fails after a pull | `npm install`, restart it |
| A prompt made a mess | `git restore .` (loses uncommitted work) or `git reset --hard HEAD` |
| Live site broken | Section 7, rollback |
| Model "Invalid API key" or "hot" | Set `FREELLMAPI_API_KEY` again, or Esc and switch model |
| Agent started the dev server or killed node | Esc, tell it not to, rerun |
| Scan stuck on the site | F12, Network and Console, send me a screenshot |

## 9. Final checklist

- [ ] Turns 1 to 4 done, everything pushed to `main`
- [ ] Both new views work on 3 real repos
- [ ] Name entrance, glow, sphere, language colors, click shockwave, report animations work
- [ ] Lint, typecheck, build, test pass on `main`
- [ ] Accessibility, performance and edge repo checks done
- [ ] README updated with GIF and live link
- [ ] Vercel shows Ready, tested on phone
- [ ] `git ls-files` shows no `.env.local`, `AGENTS.md`, `DESIGN.md`, `reference`
