# Contributor guide (for the second person on Stipple)

You and the owner both work on `main`, taking turns. Whoever holds the "baton" works. Read `MASTER-PLAN.md` sections 0, 3, 4 and 5 once.

## 1. Accept the invite
GitHub emails you an invitation to the repo. Click **Accept invitation**.

## 2. Install the tools
- Node.js 22 or newer (`node -v`), Git (`git --version`), VS Code or Antigravity
- Tell Git who you are, once:
  ```
  git config --global user.name "Your Name"
  git config --global user.email "your-github-email@example.com"
  ```

## 3. Get the code
```
cd C:\PROJECTS
git clone https://github.com/PranshuShuklaa/Stipple.git
cd Stipple
npm install
```

## 4. Your own GitHub token
Never use the owner's token. Make your own:
1. GitHub, your photo, **Settings**, **Developer settings**, **Personal access tokens**, **Fine-grained tokens**, **Generate new token**
2. Name `stipple`, longest expiry, Repository access **Public repositories (read-only)**, no permissions
3. Copy it once. Create `C:\PROJECTS\Stipple\.env.local`:
   ```
   GITHUB_TOKEN=your_token_here
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```
   No quotes, no spaces around `=`. Never paste the token in chat or a screenshot. Git ignores this file

## 5. The private files
`AGENTS.md`, `DESIGN.md` and the `reference` folder are not in Git on purpose. The owner sends them to you. Put them in `C:\PROJECTS\Stipple\` (the root). Then run `git status`: they must **not** show up. Put the notes files in `C:\PROJECTS\Stipple-notes\` (outside the project).

## 6. Check it runs
`npm run dev`, open `http://localhost:3000`. If it complains about the token, check `.env.local` and restart.

## 7. Your turn
When the owner says "baton passed to you":
```
cd C:\PROJECTS\Stipple
git switch main
git pull
npm install
npm run test
```
Everything must pass. Then do your prompts in `PROMPTS-FEATURES.md` (F0 to F6), each in a new agent session. The agent never runs `git commit` or `git push`. You do.

After each prompt: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test`, look at the site, then:
```
git status
git add -A
git commit -m "feat: short message"
```
`git status` must not list `.env.local`, `AGENTS.md`, `DESIGN.md`, `reference`, `.playwright-cli`.

## 8. End your turn
```
git pull
npm run lint
npm run typecheck
npm run build
npm run test
git push
```
Then message the owner: "Baton passed. Done: F1 to F3. Pushed. Next: F4." Every push to `main` goes live on Vercel, so only push when all four checks pass.

If `git push` says "rejected": run `git pull`, then `git push`. Conflicts: `MASTER-PLAN.md` section 4.

## 9. Rules
- Only touch the files you own (bottom of `reference/FEATURES-SPEC.md`)
- Never `git push --force`. Never commit `.env.local`, tokens or screenshots
- One agent at a time. If a prompt fails twice, switch model, then split the prompt
- If something looks wrong, run `git status` and send it to the owner before fixing
