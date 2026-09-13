[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repo = (git rev-parse --show-toplevel).Trim()
Set-Location -LiteralPath $repo

$branch = (git branch --show-current).Trim()
if ([string]::IsNullOrWhiteSpace($branch)) { throw 'Detached HEAD: switch to a feature branch first.' }

$defaultBranch = (git symbolic-ref --quiet --short refs/remotes/origin/HEAD).Replace('origin/', '')
if ($branch -eq $defaultBranch -or $branch -in @('main', 'master')) {
    throw "Refusing to push '$branch' directly. Start or switch to a feature branch."
}

Write-Host "Branch: $branch"
git status --short --branch
if (git status --porcelain) {
    throw 'Working tree is not clean. Commit or stash changes before shipping.'
}

git fetch origin --prune
$ahead = @(git log --format='%h %s' "origin/$defaultBranch..HEAD")
if ($ahead.Count -eq 0) {
    throw "No commits ahead of origin/$defaultBranch; nothing to ship."
}

git push --set-upstream origin $branch
$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if ([string]::IsNullOrWhiteSpace($gh)) {
    $installedGh = 'C:\Program Files\GitHub CLI\gh.exe'
    if (Test-Path -LiteralPath $installedGh) { $gh = $installedGh }
}
if ([string]::IsNullOrWhiteSpace($gh)) {
    throw 'GitHub CLI is not available. Install GitHub CLI, restart the terminal, then run gh auth login.'
}

$existing = & $gh pr view --head $branch --json url --jq '.url' 2>$null
if ($LASTEXITCODE -eq 0 -and $existing) {
    Write-Host "Pull request: $existing"
    exit 0
}

& $gh pr create --base $defaultBranch --head $branch --fill
