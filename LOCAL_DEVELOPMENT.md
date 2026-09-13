# Local development

## Environment and repositories

This Windows machine uses native PowerShell for these existing checkouts, rather than moving or duplicating them in WSL:

- Production: `C:\Users\RanchoTao\Desktop\Visual-Deadline`
- Reference: `C:\Users\RanchoTao\Desktop\WAYLINE\Wayline`

The outer `C:\Users\RanchoTao\Desktop\WAYLINE` tree is separate and has its own work; do not use it as the active Wayline checkout.

Native Windows was chosen because both verified repositories already live there. WSL2's `docker-desktop` distribution is stopped and no user Linux development distribution was found.

## Daily workflow

Open PowerShell and enter the production repository:

```powershell
Set-Location C:\Users\RanchoTao\Desktop\Visual-Deadline
.\scripts\new-feature.ps1 wayline-integration
codex
```

Before starting a task, `new-feature.ps1` requires a clean tree, fetches `origin`, fast-forwards the default branch only, and creates `feat/<name>`. It will never replace a pre-existing feature branch.

After editing, inspect and verify your work:

```powershell
git status
npm run typecheck
npm test
npm run build
git add <intended-files>
git commit -m "feat: describe the change"
.\scripts\ship.ps1
```

`ship.ps1` refuses `main`/`master`, refuses a dirty tree, requires commits ahead of the default branch, pushes normally, then creates a GitHub pull request if one does not already exist. It prints the PR URL.

## Install, run, and troubleshoot

VisualDeadline uses npm and its committed `package-lock.json`:

```powershell
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

Wayline uses its own npm lockfile and checks:

```powershell
Set-Location C:\Users\RanchoTao\Desktop\WAYLINE\Wayline
npm ci
npm run lint
npm run verify
npm run test:domain
npm run build
```

Useful checks: `git status --short --branch`, `git remote -v`, `git fetch --prune origin`, and `git log --oneline --decorate -10`. Run `codex doctor` for local Codex diagnostics.

## GitHub and Cloud handoff

GitHub CLI must be logged in before a push/PR can be created:

```powershell
gh auth login
```

Choose GitHub.com, HTTPS, and browser login when prompted. Do not paste tokens into the terminal or commit credentials. Confirm with `gh auth status`.

Cloud-generated branches are fetched by `git fetch --prune origin`. Review them as normal branches or PRs before integration:

```powershell
git branch -r
gh pr list --repo RanchoTao/Visual-Deadline
git switch --detach origin/<cloud-branch>
```

Do not merge Cloud work blindly. Prefer reviewing its GitHub PR, then merge through the PR or create a local feature branch from the reviewed remote branch and run the normal checks.
