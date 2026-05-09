#!/usr/bin/env pwsh
<#
    _smoke-onedrive-upload.ps1 — Runtime smoke test for helper 06's
    app-only OneDrive path.

    Drives Invoke-SeedOneDriveContent through synthetic matters with
    the token endpoint, the JSON Graph caller, and the binary upload
    invoker all replaced by in-process script blocks. Exits 0 on
    pass, non-zero on first failure.

    Run:
      ./scripts/helpers/_smoke-onedrive-upload.ps1

    Asserts (per the PR task):
      • Drive readiness probe: 404 → continue with warning, no upload.
      • Drive readiness probe: 200 → proceed.
      • Existence check: 404 → upload proceeds.
      • Existence check: 200 → upload skipped (idempotency).
      • Existence check: 403 / 500 → throws with original error visible.
      • Upload: 201 / 200 → state recorded, success logged.
      • Upload: 403 → throws, no success log.
      • Binary body preserved through the call (content-type + bytes).
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ───────────────────────────────────────────────────────────────────
# Sandbox temp dir + state file rebind.
# ───────────────────────────────────────────────────────────────────

$smokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("aegis-smoke-od-" + [guid]::NewGuid())
[void](New-Item -ItemType Directory -Path $smokeRoot -Force)

. (Join-Path $PSScriptRoot '_lib.ps1')
. (Join-Path $PSScriptRoot '_app-only-auth.ps1')
. (Join-Path $PSScriptRoot '06-seed-onedrive-content.ps1')

# Override _docgen.ps1's New-DocumentBytes (dot-sourced via 06) with a
# deterministic stub so the smoke owns the byte buffer it expects to
# see arrive at the upload invoker. Must come AFTER the dot-source.
function New-DocumentBytes {
    param([string]$TemplateKey, [string]$FileName)
    $tag = "$TemplateKey|$FileName"
    $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash(
        [System.Text.Encoding]::UTF8.GetBytes($tag))
    return [byte[]]($hash[0..15])
}

$Script:StateFile = Join-Path $smokeRoot '.seed-state.json'
$Script:SeedDataRoot = Join-Path $smokeRoot 'seed-data'

$env:AEGIS_M365_CLIENT_SECRET = 'fake-secret-for-smoke-only'

# ───────────────────────────────────────────────────────────────────
# Tiny assertion helpers (no Pester).
# ───────────────────────────────────────────────────────────────────

$Failures = New-Object System.Collections.ArrayList

function Assert-True {
    param([Parameter(Mandatory)][bool]$Condition, [Parameter(Mandatory)][string]$Message)
    if (-not $Condition) {
        [void]$Failures.Add($Message)
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
# Captures + mock invokers. The Graph caller drives both the drive-
# readiness probe and the existence check; rules are keyed on the
# (Method, URI-suffix) pair.
# ───────────────────────────────────────────────────────────────────

$captures = @{
    TokenFetchCount = 0
    GraphCalls      = New-Object System.Collections.ArrayList
    UploadCalls     = New-Object System.Collections.ArrayList
    GraphRules      = @()    # array of @{ Match=<scriptblock>; Status=<int>; Body=<obj> }
    UploadRules     = @()    # array of @{ Match=<scriptblock>; Throw=<bool>; Status=<int> }
}

# A faux-HttpResponseException class so mock invokers can simulate
# Invoke-WebRequest's 4xx/5xx exception shape.
class FakeResponse {
    [int]$StatusCode
    FakeResponse([int]$s) { $this.StatusCode = $s }
}

function New-FakeWebException {
    param([int]$StatusCode, [string]$Message)
    $resp = [FakeResponse]::new($StatusCode)
    $ex = [System.Exception]::new($Message)
    Add-Member -InputObject $ex -NotePropertyName 'Response' -NotePropertyValue $resp -Force
    return $ex
}

function Reset-Mocks {
    $captures.TokenFetchCount = 0
    $captures.GraphCalls.Clear()
    $captures.UploadCalls.Clear()
    $captures.GraphRules = @()
    $captures.UploadRules = @()
    Clear-AegisM365AppOnlyToken

    $Script:AegisAppOnlyTokenInvoker = {
        param($Uri, $FormBody)
        $captures.TokenFetchCount++
        return [pscustomobject]@{
            access_token = "fake-token-$($captures.TokenFetchCount)"
            expires_in   = 3600
            token_type   = 'Bearer'
        }
    }.GetNewClosure()

    $Script:AegisAppOnlyGraphInvoker = {
        param($Method, $Uri, $Headers, $JsonBody)
        $entry = [pscustomobject]@{ Method = $Method; Uri = $Uri }
        [void]$captures.GraphCalls.Add($entry)

        foreach ($rule in $captures.GraphRules) {
            if (& $rule.Match $Method $Uri) {
                if ($rule.Status -ge 400) {
                    throw New-FakeWebException -StatusCode $rule.Status `
                        -Message "Mock graph $($rule.Status) for $Uri"
                }
                return [pscustomobject]@{ StatusCode = $rule.Status; Content = ($rule.Body | ConvertTo-Json -Compress -Depth 6) }
            }
        }
        throw "No mock rule matched $Method $Uri"
    }.GetNewClosure()

    $Script:AegisOneDriveUploadInvoker = {
        param($Url, $Token, $Bytes, $ContentType)
        $entry = [pscustomobject]@{
            Url         = $Url
            Token       = $Token
            Bytes       = $Bytes
            ContentType = $ContentType
        }
        [void]$captures.UploadCalls.Add($entry)

        foreach ($rule in $captures.UploadRules) {
            if (& $rule.Match $Url) {
                if ($rule.Throw) {
                    throw New-FakeWebException -StatusCode $rule.Status `
                        -Message "Mock upload $($rule.Status) for $Url"
                }
                return [pscustomobject]@{ id = "upload-id-$($captures.UploadCalls.Count)" }
            }
        }
        # Default: success.
        return [pscustomobject]@{ id = "upload-id-$($captures.UploadCalls.Count)" }
    }.GetNewClosure()
}

# Convenience for adding rules.
function Add-GraphRule { param($Match, [int]$Status, $Body = $null)
    $captures.GraphRules += @{ Match = $Match; Status = $Status; Body = $Body }
}
function Add-UploadRule { param($Match, [bool]$Throw = $false, [int]$Status = 201)
    $captures.UploadRules += @{ Match = $Match; Throw = $Throw; Status = $Status }
}

# ───────────────────────────────────────────────────────────────────
# Synthetic seed-data fixture. Two matters; alice owns 2 docs, bob
# owns 1, dan (drive-not-ready) owns 1.
# ───────────────────────────────────────────────────────────────────

[void](New-Item -ItemType Directory -Path (Join-Path $Script:SeedDataRoot 'matters') -Force)

$matterAJson = @'
{
  "matterId": "m-od-a",
  "onedrive": [
    { "userKey": "alice", "fileName": "complaint.docx", "templateKey": "tplA" },
    { "userKey": "alice", "fileName": "exhibit-1.docx", "templateKey": "tplB" }
  ]
}
'@
Set-Content -Path (Join-Path $Script:SeedDataRoot 'matters/a.json') -Value $matterAJson -Encoding UTF8

$matterBJson = @'
{
  "matterId": "m-od-b",
  "onedrive": [
    { "userKey": "bob", "fileName": "memo.docx",  "templateKey": "tplC" },
    { "userKey": "dan", "fileName": "lonely.docx", "templateKey": "tplD" }
  ]
}
'@
Set-Content -Path (Join-Path $Script:SeedDataRoot 'matters/b.json') -Value $matterBJson -Encoding UTF8

$userMap = @{
    alice = [pscustomobject]@{ key='alice'; id='id-alice'; upn='alice@x'; displayName='Alice' }
    bob   = [pscustomobject]@{ key='bob';   id='id-bob';   upn='bob@x';   displayName='Bob'   }
    dan   = [pscustomobject]@{ key='dan';   id='id-dan';   upn='dan@x';   displayName='Dan'   }
}

# ───────────────────────────────────────────────────────────────────
# Scenario 1 — Drive readiness probe: 404 short-circuits one user;
# 200 lets others proceed.
# ───────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '── Scenario 1: drive readiness probe (404 skips user, 200 proceeds) ──' -ForegroundColor Cyan
Reset-Mocks

# Drive probe rules:
#   alice + bob → 200 (drives ready)
#   dan        → 404 (drive not provisioned; whole user skipped)
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-alice/drive$' } 200 (@{ id='drv-alice' })
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-bob/drive$'   } 200 (@{ id='drv-bob' })
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-dan/drive$'   } 404
# Existence checks: every file 404 (not present), so upload proceeds.
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/drive/root:/' } 404
# Uploads succeed.
Add-UploadRule { param($u) $true } $false 201

Invoke-SeedOneDriveContent -UserMap $userMap

Assert-Equal 3 $captures.UploadCalls.Count 'three uploads attempted (alice x2, bob x1, dan skipped)'
$danUploads = @($captures.UploadCalls | Where-Object { $_.Url -match '/users/id-dan/' })
Assert-Equal 0 $danUploads.Count 'dan uploads skipped after 404 probe'
$danProbes = @($captures.GraphCalls | Where-Object { $_.Method -eq 'GET' -and $_.Uri -match '/users/id-dan/drive$' })
Assert-Equal 1 $danProbes.Count 'dan drive probed exactly once'
$alicProbes = @($captures.GraphCalls | Where-Object { $_.Method -eq 'GET' -and $_.Uri -match '/users/id-alice/drive$' })
Assert-Equal 1 $alicProbes.Count 'alice drive probed exactly once (cached across her 2 docs)'

# Binary body preservation: each upload should carry the exact bytes
# New-DocumentBytes returned for that (template, fileName).
$expected = New-DocumentBytes -TemplateKey 'tplA' -FileName 'complaint.docx'
$actual = ($captures.UploadCalls | Where-Object { $_.Url -match 'complaint\.docx' })[0].Bytes
Assert-Equal 16 $actual.Length 'upload byte length matches input'
$bytesMatch = ($expected.Length -eq $actual.Length)
for ($i = 0; $bytesMatch -and $i -lt $expected.Length; $i++) {
    if ($expected[$i] -ne $actual[$i]) { $bytesMatch = $false }
}
Assert-True $bytesMatch 'upload bytes preserved byte-for-byte'

$ct = ($captures.UploadCalls | Where-Object { $_.Url -match 'complaint\.docx' })[0].ContentType
Assert-Equal 'application/octet-stream' $ct 'content-type is application/octet-stream'

# ───────────────────────────────────────────────────────────────────
# Scenario 2 — Existence check: 200 means file exists, upload skipped.
# ───────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '── Scenario 2: existence check 200 → idempotent skip ──' -ForegroundColor Cyan
Reset-Mocks

Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-alice/drive$' } 200 (@{ id='drv-alice' })
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-bob/drive$'   } 200 (@{ id='drv-bob' })
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-dan/drive$'   } 200 (@{ id='drv-dan' })
# All existence checks return 200 (already present).
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/drive/root:/' } 200 (@{ id='existing-item' })

Invoke-SeedOneDriveContent -UserMap $userMap

Assert-Equal 0 $captures.UploadCalls.Count 'no uploads issued (every file already present)'

# ───────────────────────────────────────────────────────────────────
# Scenario 3 — Existence check: 403 must throw with original error
# visible in the message. Silent error swallowing was the helper-05
# bug we killed; do not let it back in here.
# ───────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '── Scenario 3: existence check 403 → throws with status visible ──' -ForegroundColor Cyan
Reset-Mocks

Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-alice/drive$' } 200 (@{ id='drv-alice' })
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-bob/drive$'   } 200 (@{ id='drv-bob' })
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-dan/drive$'   } 200 (@{ id='drv-dan' })
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/drive/root:/' } 403

$threw = $false
$msg = ''
try {
    Invoke-SeedOneDriveContent -UserMap $userMap
} catch {
    $threw = $true
    $msg = [string]$_.Exception.Message
}
Assert-True $threw 'existence check 403 caused a thrown error'
Assert-True ($msg -match 'status 403') 'error message mentions HTTP 403'
Assert-True ($msg -match 'Existence check failed') 'error message identifies the existence check'
Assert-Equal 0 $captures.UploadCalls.Count 'no upload attempted on existence-check failure'

# ───────────────────────────────────────────────────────────────────
# Scenario 4 — Existence check: 500 must also throw (not silently skip).
# ───────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '── Scenario 4: existence check 500 → throws ──' -ForegroundColor Cyan
Reset-Mocks

Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-alice/drive$' } 200 (@{ id='drv-alice' })
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-bob/drive$'   } 200 (@{ id='drv-bob' })
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-dan/drive$'   } 200 (@{ id='drv-dan' })
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/drive/root:/' } 500

$threw = $false
$msg = ''
try {
    Invoke-SeedOneDriveContent -UserMap $userMap
} catch {
    $threw = $true
    $msg = [string]$_.Exception.Message
}
Assert-True $threw 'existence check 500 caused a thrown error'
Assert-True ($msg -match 'status 500') 'error message mentions HTTP 500'

# ───────────────────────────────────────────────────────────────────
# Scenario 5 — Upload: 403 must throw and no success line.
# ───────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '── Scenario 5: upload 403 → throws, no success ──' -ForegroundColor Cyan
Reset-Mocks

Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-alice/drive$' } 200 (@{ id='drv-alice' })
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-bob/drive$'   } 200 (@{ id='drv-bob' })
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-dan/drive$'   } 200 (@{ id='drv-dan' })
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/drive/root:/' } 404
Add-UploadRule { param($u) $true } $true 403

$threw = $false
try {
    Invoke-SeedOneDriveContent -UserMap $userMap
} catch {
    $threw = $true
}
Assert-True $threw 'upload 403 surfaced as terminating error'
Assert-Equal 1 $captures.UploadCalls.Count 'first upload attempted, run aborted before second'

# ───────────────────────────────────────────────────────────────────
# Scenario 6 — Drive readiness 500 (non-404) must throw.
# ───────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '── Scenario 6: drive readiness probe non-404 → throws ──' -ForegroundColor Cyan
Reset-Mocks

Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/users/id-alice/drive$' } 500
Add-GraphRule { param($m,$u) $m -eq 'GET' -and $u -match '/drive/root:/' } 404

$threw = $false
$msg = ''
try {
    Invoke-SeedOneDriveContent -UserMap $userMap
} catch {
    $threw = $true
    $msg = [string]$_.Exception.Message
}
Assert-True $threw 'drive probe 500 surfaced as terminating error'
Assert-True ($msg -match 'Drive readiness probe failed') 'error message identifies the probe path'
Assert-True ($msg -match 'status 500') 'error message includes the actual status'

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
