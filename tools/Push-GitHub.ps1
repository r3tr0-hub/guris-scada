#requires -Version 5.1
param(
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9-]*$')]
    [string]$Owner = 'r3tr0-hub',
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]*$')]
    [string]$Repository = 'guris-scada'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$gitCommand = Get-Command git -ErrorAction SilentlyContinue
if ($null -eq $gitCommand) { throw 'Install Git for Windows, then run this script again.' }
$gitPath = $gitCommand.Source
$url = 'https://github.com/' + $Owner + '/' + $Repository + '.git'

function Invoke-ProjectGit {
    param([string[]]$GitArguments)
    # Git uses stderr for normal progress; the exit code determines failure.
    $ErrorActionPreference = 'Continue'
    & $gitPath -C $root @GitArguments
    if ($LASTEXITCODE -ne 0) { throw ('Git failed: ' + ($GitArguments -join ' ')) }
}

foreach ($required in @('VERSION', '.gitignore', 'src/main.c', 'ui/index.html')) {
    if (!(Test-Path -LiteralPath (Join-Path $root $required) -PathType Leaf)) {
        throw ('Not a complete SCADA source folder: missing ' + $required)
    }
}
$version = (Get-Content -LiteralPath (Join-Path $root 'VERSION') -Raw).Trim()
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid VERSION file.' }
$tag = 'v' + $version

if (!(Test-Path -LiteralPath (Join-Path $root '.git'))) {
    Invoke-ProjectGit -GitArguments @('init', '-b', 'main')
}
$actualRoot = (Invoke-ProjectGit -GitArguments @('rev-parse', '--show-toplevel')).Trim()
if ([IO.Path]::GetFullPath($actualRoot) -ne $root) { throw 'The Git root must be this SCADA source folder.' }
$branch = (Invoke-ProjectGit -GitArguments @('symbolic-ref', '--short', 'HEAD')).Trim()
if ($branch -ne 'main') { throw 'Use the main branch for the initial upload. No branches have been renamed.' }
$remotes = @(Invoke-ProjectGit -GitArguments @('remote'))
if ($remotes -contains 'origin') {
    $existing = (Invoke-ProjectGit -GitArguments @('remote', 'get-url', 'origin')).Trim()
    if ($existing -ne $url) { throw ('origin already points to ' + $existing + '. No remote has been replaced.') }
} else {
    Invoke-ProjectGit -GitArguments @('remote', 'add', 'origin', $url)
}

Write-Host ('Target: ' + $url)
Write-Host 'The repository must already exist on GitHub and be empty. Git may open a sign-in browser.'
$remoteRefs = @(Invoke-ProjectGit -GitArguments @('ls-remote', '--heads', '--tags', 'origin'))
if ($remoteRefs.Count -gt 0) {
    throw 'The remote repository is not empty. Use normal git commit/push for updates; see docs/GITHUB_SETUP_RU.md.'
}

# Configuring identity here affects only this repository.
$author = & $gitPath -C $root config user.name
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace([string]$author)) {
    Invoke-ProjectGit -GitArguments @('config', 'user.name', 'Авсаркисов Д.А.')
}
$email = & $gitPath -C $root config user.email
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace([string]$email)) {
    Invoke-ProjectGit -GitArguments @('config', 'user.email', 'wizzigun@gmail.com')
}
foreach ($ignored in @('connection.json', 'local/accounts.json', 'GurisSCADA_0_1.exe', 'tests/node_modules/package.json')) {
    Invoke-ProjectGit -GitArguments @('check-ignore', '-q', $ignored)
}
Invoke-ProjectGit -GitArguments @('add', '--all', '--', '.')
& $gitPath -C $root diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
    Invoke-ProjectGit -GitArguments @('commit', '-m', ('Import production SCADA ' + $version + ' sources'))
} elseif ($LASTEXITCODE -ne 0) {
    throw 'Cannot inspect the staged changes.'
}
$null = Invoke-ProjectGit -GitArguments @('rev-parse', '--verify', 'HEAD')
$tags = @(Invoke-ProjectGit -GitArguments @('tag', '--list', $tag))
if ($tags.Count -eq 0) {
    Invoke-ProjectGit -GitArguments @('tag', '-a', $tag, '-m', ('Production SCADA ' + $version + ' source baseline'))
} else {
    $tagCommit = (Invoke-ProjectGit -GitArguments @('rev-parse', ($tag + '^{commit}'))).Trim()
    $headCommit = (Invoke-ProjectGit -GitArguments @('rev-parse', 'HEAD')).Trim()
    if ($tagCommit -ne $headCommit) { throw 'The version tag already points to another commit. No tag has been moved.' }
}
Invoke-ProjectGit -GitArguments @('push', '--set-upstream', 'origin', 'main')
Invoke-ProjectGit -GitArguments @('push', 'origin', $tag)
Write-Host ('Uploaded: https://github.com/' + $Owner + '/' + $Repository)
Write-Host 'Open the Actions tab to see the build and test results.'
