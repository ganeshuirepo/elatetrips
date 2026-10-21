param([switch]$EnvironmentProbe)

$ErrorActionPreference = 'Stop'
$allowedEnvironmentNames = @(
    'path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp',
    'userprofile', 'homedrive', 'homepath', 'appdata', 'localappdata',
    'programfiles', 'programfiles(x86)', 'programdata',
    'number_of_processors', 'processor_architecture'
)
foreach ($entry in @(Get-ChildItem Env:)) {
    if ($entry.Name.ToLowerInvariant() -notin $allowedEnvironmentNames) {
        [Environment]::SetEnvironmentVariable($entry.Name, $null, 'Process')
    }
}
$backend = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../../elatetrips-node'))
$worktree = Split-Path -Parent $backend
$env:NODE_ENV = 'test'
$env:MONGODB_URI = 'mongodb://127.0.0.1:1/v10-test-disabled'
$env:JWT_SECRET = 'fixture-v10-test-secret-not-production'
$env:ADMIN_KEY = 'fixture-v10-admin-not-production'
foreach ($key in @('BREVO_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'FAST2SMS_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_PASS')) {
    [Environment]::SetEnvironmentVariable($key, '', 'Process')
}
$env:MONGOMS_SYSTEM_BINARY = Join-Path $worktree '.claude/.cache/014-acceptance/mongod-x64-win32-8.2.6.exe'
$env:MONGOMS_VERSION = '8.2.6'
$env:MONGOMS_RUNTIME_DOWNLOAD = 'false'
$env:npm_config_cache = Join-Path $worktree '.claude/.cache/015-rfq/npm'
$env:npm_config_ignore_scripts = 'true'
$env:npm_config_update_notifier = 'false'

if ($EnvironmentProbe) {
    & node -e "for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'SYNTHETIC_REVIEW_SECRET']) { if (process.env[name] !== undefined) throw new Error('Ambient injection survived'); } if (process.env.JWT_SECRET !== 'fixture-v10-test-secret-not-production' || process.env.MONGOMS_RUNTIME_DOWNLOAD !== 'false') throw new Error('Fixture configuration absent'); console.log('Environment probe passed: injection absent; fixture configuration present');"
    if ($LASTEXITCODE -ne 0) { throw 'Environment probe failed' }
    return
}

function Invoke-Check([string]$Name, [string]$Executable, [string[]]$Arguments) {
    $output = & $Executable @Arguments 2>&1
    $code = $LASTEXITCODE
    Set-Content -LiteralPath (Join-Path $PSScriptRoot "$Name.log") -Value ($output -join [Environment]::NewLine)
    Add-Content -LiteralPath (Join-Path $PSScriptRoot "$Name.log") -Value "Process exit: $code"
    Write-Output "$Name exit=$code"
    if ($code -ne 0) { throw "$Name failed; see its evidence log" }
}

Push-Location -LiteralPath $backend
try {
    Invoke-Check 'focused-after' 'node' @('-r', './scripts/register-ts.js', '--test', 'src/modules/rfqflow/rfqflow.test.ts')
    Invoke-Check 'lint-after' 'node' @('./node_modules/eslint/bin/eslint.js', 'src/modules/rfqflow/**/*.ts', '--max-warnings', '0')
    Invoke-Check 'typecheck' 'npm.cmd' @('run', 'typecheck')
    Invoke-Check 'contracts' 'npm.cmd' @('run', 'test:contracts')
    Invoke-Check 'build' 'npm.cmd' @('run', 'build')
} finally {
    Pop-Location
}
