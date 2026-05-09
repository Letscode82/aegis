#!/usr/bin/env pwsh
<#
    _smoke-app-only-auth.ps1 — Runtime smoke test for the
    app-only auth path used by helper 05.

    Drives Get-AegisM365AppOnlyToken + Invoke-SeedMailboxContent
    through synthetic matters with the token endpoint and
    sendMail endpoint replaced by in-process script blocks.
    Exits 0 on pass, non-zero on first failure.

    Run:
      ./scripts/helpers/_smoke-app-only-auth.ps1

    Asserts (per the PR task):
      • Token fetched once, reused across 3 sendMail calls.
      • Each sendMail POST hits /v1.0/users/{senderId}/sendMail.
      • 202 → state mark written for each email.
      • 403 mid-batch → throws, state for failing email NOT
        written, prior emails' state IS written, subsequent
        emails not attempted.
      • Token refresh fires when cache is within 5 min of expiry.
      • Reset-LegacySentEmailsStateIfNeeded fires when
        stateSchemaVersion is missing; no-op when it's 2.
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ───────────────────────────────────────────────────────────────────
# Sandbox state file. We rebind $Script:StateFile after sourcing
# _lib.ps1 so the smoke never reads or writes the real seed state.
# ───────────────────────────────────────────────────────────────────

$smokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("aegis-smoke-" + [guid]::NewGuid())
[void](New-Item -ItemType Directory -Path $smokeRoot -Force)
$smokeStateFile = Join-Path $smokeRoot '.seed-state.json'

. (Join-Path $PSScriptRoot '_lib.ps1')
. (Join-Path $PSScriptRoot '_app-only-auth.ps1')
. (Join-Path $PSScriptRoot '05-seed-mailbox-content.ps1')

$Script:StateFile = $smokeStateFile
$Script:SeedDataRoot = Join-Path $smokeRoot 'seed-data'

# Required env vars. The smoke fakes the secret value because the
# token endpoint is mocked.
$env:AEGIS_M365_CLIENT_SECRET = 'fake-secret-for-smoke-only'

# ───────────────────────────────────────────────────────────────────
# Tiny assertion helpers (no Pester dependency).
# ───────────────────────────────────────────────────────────────────

$Failures = New-Object System.Collections.ArrayList

function Assert-True {
    param([Parameter(Mandatory)][bool]$Condition, [Parameter(Mandatory)][string]$Message)
    if (-not $Condition) {
        [void]$Script:Failures.Add($Message)
        Write-Host "  FAIL: $Message" -ForegroundColor Red
    } else {
        Write-Host "  ok   $Message" -ForegroundColor Green
    }
}
function Assert-Equal {
    param($Expected, $Actual, [Parameter(Mandatory)][string]$Message)
    Assert-True ($Expected -eq $Actual) "$Message (expected=$Expected, actual=$Actual)"
}

# ───────────────────────────────────────────────────────────────────
# Captures hashtable — every mock script block reads + writes
# through this single object via .GetNewClosure(). Avoids the
# $Script: vs module-scope foot-gun (the script blocks execute
# in _app-only-auth.ps1's scope, not this script's).
# ───────────────────────────────────────────────────────────────────

$captures = @{
    TokenFetchCount = 0
    SendMailCalls   = New-Object System.Collections.ArrayList
    FailOnCallNumber = 0   # 0 = never; otherwise call index that should 403
}

function Reset-Mocks {
    param([int]$ExpiresIn = 3600, [int]$FailOnCallNumber = 0)
    $captures.TokenFetchCount = 0
    $captures.SendMailCalls.Clear()
    $captures.FailOnCallNumber = $FailOnCallNumber
    Clear-AegisM365AppOnlyToken

    $Script:AegisAppOnlyTokenInvoker = {
        param($Uri, $FormBody)
        $captures.TokenFetchCount++
        return [pscustomobject]@{
            access_token = "fake-token-$($captures.TokenFetchCount)"
            expires_in   = $ExpiresIn
            token_type   = 'Bearer'
        }
    }.GetNewClosure()

    $Script:AegisAppOnlyGraphInvoker = {
        param($Method, $Uri, $Headers, $JsonBody)
        $entry = [pscustomobject]@{
            Method  = $Method
            Uri     = $Uri
            Headers = $Headers
            Body    = $JsonBody
        }
        [void]$captures.SendMailCalls.Add($entry)
        if ($captures.FailOnCallNumber -gt 0 -and $captures.SendMailCalls.Count -eq $captures.FailOnCallNumber) {
            throw "Mock sendMail forbidden (HTTP 403)."
        }
        return [pscustomobject]@{ StatusCode = 202; Content = '' }
    }.GetNewClosure()
}

# ───────────────────────────────────────────────────────────────────
# Synthetic seed-data fixture under the temp dir.
# Three emails total, two matters.
# ───────────────────────────────────────────────────────────────────

[void](New-Item -ItemType Directory -Path (Join-Path $Script:SeedDataRoot 'emails') -Force)
[void](New-Item -ItemType Directory -Path (Join-Path $Script:SeedDataRoot 'matters') -Force)

Set-Content -Path (Join-Path $Script:SeedDataRoot 'emails/body.txt') -Value 'Hello world body.' -Encoding UTF8

$matterAJson = @'
{
  "matterId": "m-smoke-a",
  "emails": [
    { "id": "e1", "from": "alice", "to": ["bob"],   "cc": [],          "subject": "First",  "bodyTemplate": "body.txt", "privileged": false },
    { "id": "e2", "from": "alice", "to": ["bob"],   "cc": ["carol"],   "subject": "Second", "bodyTemplate": "body.txt", "privileged": true  }
  ]
}
'@
Set-Content -Path (Join-Path $Script:SeedDataRoot 'matters/a.json') -Value $matterAJson -Encoding UTF8

$matterBJson = @'
{
  "matterId": "m-smoke-b",
  "emails": [
    { "id": "e3", "from": "bob",   "to": ["alice"], "cc": [],          "subject": "Third",  "bodyTemplate": "body.txt", "privileged": false }
  ]
}
'@
Set-Content -Path (Join-Path $Script:SeedDataRoot 'matters/b.json') -Value $matterBJson -Encoding UTF8

$userMap = @{
    alice = [pscustomobject]@{ key='alice'; id='id-alice'; upn='alice@x'; displayName='Alice' }
    bob   = [pscustomobject]@{ key='bob';   id='id-bob';   upn='bob@x';   displayName='Bob'   }
    carol = [pscustomobject]@{ key='carol'; id='id-carol'; upn='carol@x'; displayName='Carol' }
}

function Reset-State {
    if (Test-Path $Script:StateFile) { Remove-Item $Script:StateFile -Force }
}

function Get-SentEmailKeys {
    $state = Get-SeedState
    if (-not $state.PSObject.Properties['sentEmails']) { return ,@() }
    $bucket = $state.sentEmails
    if (-not $bucket) { return ,@() }
    $names = @($bucket.PSObject.Properties | ForEach-Object { $_.Name })
    return ,$names
}

# ───────────────────────────────────────────────────────────────────
# Scenario 1 — happy path. 3 emails all 202.
# ───────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '── Scenario 1: 3 emails, all 202 ──' -ForegroundColor Cyan
Reset-State
Reset-Mocks

Invoke-SeedMailboxContent -UserMap $userMap

Assert-Equal 1 $captures.TokenFetchCount 'token fetched exactly once across 3 sends'
Assert-Equal 3 $captures.SendMailCalls.Count 'three sendMail POSTs issued'
foreach ($call in $captures.SendMailCalls) {
    Assert-True ($call.Method -eq 'POST') "sendMail method is POST ($($call.Uri))"
    Assert-True ($call.Uri -match '/v1\.0/users/[^/]+/sendMail$') "URI shape ($($call.Uri))"
    Assert-True ($call.Headers.Authorization.StartsWith('Bearer ')) 'bearer header present'
}
$sentKeys = Get-SentEmailKeys
Assert-Equal 3 $sentKeys.Count 'state has three sentEmails marks'
Assert-True ($sentKeys -contains 'm-smoke-a:e1') 'mark for e1 written'
Assert-True ($sentKeys -contains 'm-smoke-a:e2') 'mark for e2 written'
Assert-True ($sentKeys -contains 'm-smoke-b:e3') 'mark for e3 written'
$state = Get-SeedState
Assert-Equal 2 $state.stateSchemaVersion 'stateSchemaVersion stamped to 2'

# ───────────────────────────────────────────────────────────────────
# Scenario 2 — 403 on second send must abort. e1 mark written, e2
# mark NOT written, e3 not attempted.
# ───────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '── Scenario 2: 403 mid-batch aborts the run ──' -ForegroundColor Cyan
Reset-State
Reset-Mocks -FailOnCallNumber 2

$threw = $false
try {
    Invoke-SeedMailboxContent -UserMap $userMap
} catch {
    $threw = $true
}
Assert-True $threw 'Invoke-SeedMailboxContent rethrew on 403'
Assert-Equal 2 $captures.SendMailCalls.Count 'exactly two sends attempted (e3 not reached)'
$sentKeys = Get-SentEmailKeys
Assert-True ($sentKeys -contains 'm-smoke-a:e1') 'e1 mark written before failure'
Assert-True (-not ($sentKeys -contains 'm-smoke-a:e2')) 'e2 mark NOT written (failed)'
Assert-True (-not ($sentKeys -contains 'm-smoke-b:e3')) 'e3 mark NOT written (not attempted)'

# ───────────────────────────────────────────────────────────────────
# Scenario 3 — token refreshes when cached entry is < 5 min from expiry.
# ───────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '── Scenario 3: token refresh under 5-min remaining ──' -ForegroundColor Cyan
Reset-Mocks -ExpiresIn 3600

$first = Get-AegisM365AppOnlyToken
$second = Get-AegisM365AppOnlyToken
Assert-Equal 1 $captures.TokenFetchCount 'fresh token cached, second call reused it'
Assert-Equal $first $second 'same token string returned'

# Force the cache to expire in 4 minutes — under the 5-min threshold.
$Script:AegisAppOnlyToken.ExpiresAt = (Get-Date).AddMinutes(4)
$third = Get-AegisM365AppOnlyToken
Assert-Equal 2 $captures.TokenFetchCount 'expiring-soon cache triggered a refresh'
Assert-True ($third -ne $first) 'new token returned after refresh'

# ───────────────────────────────────────────────────────────────────
# Scenario 4 — state-schema migration only fires when needed.
# ───────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '── Scenario 4: legacy sentEmails reset gated by schema version ──' -ForegroundColor Cyan

# 4a. Legacy state with stale sentEmails entries.
Reset-State
$legacy = [pscustomobject]@{
    tenant     = 'fake-tenant'
    startedAt  = (Get-Date).ToString('o')
    completed  = [pscustomobject]@{}
    sentEmails = [pscustomobject]@{ 'm-old:e1' = [pscustomobject]@{ sentAt = 'long ago' } }
}
Save-SeedState $legacy
$reset = Reset-LegacySentEmailsStateIfNeeded
Assert-True $reset 'reset returns true on legacy state (no version field)'
$post = Get-SeedState
Assert-Equal 2 $post.stateSchemaVersion 'stateSchemaVersion stamped to 2 after reset'
$postKeys = Get-SentEmailKeys
Assert-Equal 0 $postKeys.Count 'sentEmails bucket emptied'

# 4b. Already-migrated state — no-op.
$reset2 = Reset-LegacySentEmailsStateIfNeeded
Assert-True (-not $reset2) 'reset returns false when stateSchemaVersion already 2'

# ───────────────────────────────────────────────────────────────────
# Cleanup + summary
# ───────────────────────────────────────────────────────────────────

Remove-Item -Recurse -Force $smokeRoot
Remove-Item Env:\AEGIS_M365_CLIENT_SECRET -ErrorAction SilentlyContinue

Write-Host ''
if ($Failures.Count -gt 0) {
    Write-Host "✗ $($Failures.Count) assertion failure(s):" -ForegroundColor Red
    $Failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}
Write-Host '✓ all scenarios passed' -ForegroundColor Green
exit 0
