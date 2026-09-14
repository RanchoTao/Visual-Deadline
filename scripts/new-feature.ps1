[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Name
)

$ErrorActionPreference = 'Stop'
$repo = (git rev-parse --show-toplevel).Trim()
Set-Location -LiteralPath $repo

if (git status --porcelain) {
    throw 'Working tree is not clean. Commit, stash, or resolve your changes before starting a feature branch.'
}

$slug = ($Name.Trim().ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
if ([string]::IsNullOrWhiteSpace($slug)) {
    throw 'Feature name must contain letters or numbers.'
}

$defaultBranch = (git symbolic-ref --quiet --short refs/remotes/origin/HEAD).Replace('origin/', '')
if ([string]::IsNullOrWhiteSpace($defaultBranch)) {
    throw 'Cannot determine origin default branch. Set origin/HEAD, then retry.'
}

$branch = "feat/$slug"
git check-ref-format --branch $branch | Out-Null
git fetch origin --prune
git switch $defaultBranch
git pull --ff-only origin $defaultBranch

if (git show-ref --verify --quiet "refs/heads/$branch") {
    throw "Local branch '$branch' already exists; refusing to reuse it automatically. Switch to it explicitly if intended."
}

git switch -c $branch
Write-Host "Ready: $branch"
