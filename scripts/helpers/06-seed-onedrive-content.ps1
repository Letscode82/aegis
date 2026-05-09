#!/usr/bin/env pwsh
<#
    06-seed-onedrive-content.ps1 — Upload generated documents to each
    user's OneDrive root.

    Auth model — same constraint as helper 05
    ─────────────────────────────────────────
    Cross-user OneDrive operations require APPLICATION permissions.
    Delegated Global Admin is rejected by the Graph permission model:
      GET /v1.0/users/{otherUserId}/drive  → 403 in delegated, 200 in app-only
      PUT /v1.0/users/{otherUserId}/drive/root:/{name}:/content  → same
    Files.ReadWrite.All granted to the signed-in admin does not unlock
    acting on another user's drive.

    Therefore: existence check + upload go through Get-AegisM365AppOnlyToken.
    The shared Invoke-AegisM365GraphAppOnly helper covers the JSON GET;
    binary PUT goes through a small in-file invoker (test seam) that wraps
    Invoke-RestMethod with the bearer header — Invoke-AegisM365GraphAppOnly
    is intentionally JSON-only.

    Drive readiness
    ───────────────
    OneDrive provisioning lags license assignment by minutes. Helper 03
    pre-provisions every active user's site via Request-SPOPersonalSite,
    but Graph's drive endpoints can still 404 for some minutes after.
    A single GET /users/{id}/drive probe per owner short-circuits an
    entire user's uploads with a Write-Warn on 404, so a partial run
    today + a finishing run tomorrow stays clean. Other failures
    (auth, network, throttle) propagate.

    Idempotency: by file name in the user's drive root. Skip if present.
    The byte content is regenerated each run from documents/index.json.
#>

. (Join-Path $PSScriptRoot '_lib.ps1')
. (Join-Path $PSScriptRoot '_docgen.ps1')
. (Join-Path $PSScriptRoot '_app-only-auth.ps1')

# ───────────────────────────────────────────────────────────────────
# Test seam for binary OneDrive PUT. Wraps the bearer-token call so
# the smoke can intercept the request and assert byte-for-byte body
# preservation. Real implementation calls Invoke-RestMethod directly.
# ───────────────────────────────────────────────────────────────────

$Script:AegisOneDriveUploadInvoker = {
    param($Url, $Token, $Bytes, $ContentType)
    Invoke-RestMethod `
        -Method PUT `
        -Uri $Url `
        -Headers @{ Authorization = "Bearer $Token" } `
        -ContentType $ContentType `
        -Body $Bytes
}

# ───────────────────────────────────────────────────────────────────
# Drive readiness probe. Returns $true on 200, $false on 404 (with a
# Write-Warn for the operator). Other status codes throw.
# ───────────────────────────────────────────────────────────────────

function Test-AegisOneDriveReady {
    param(
        [Parameter(Mandatory)][string]$OwnerId,
        [Parameter(Mandatory)][string]$OwnerUpn
    )
    try {
        [void](Invoke-AegisM365GraphAppOnly -Method GET -Path "/v1.0/users/$OwnerId/drive")
        return $true
    } catch {
        $statusCode = $null
        try {
            if ($_.Exception -and $_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }
        } catch {}
        if ($statusCode -eq 404) {
            Write-Warn "$OwnerUpn — OneDrive not yet provisioned in Graph; skipping uploads for this user. Re-run later."
            return $false
        }
        throw "Drive readiness probe failed for ${OwnerUpn} (status ${statusCode}): $($_.Exception.Message)"
    }
}

function Invoke-SeedOneDriveContent {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $UserMap,
        [switch]$VerifyOnly
    )

    Write-Step "Seeding OneDrive content"

    if (-not $VerifyOnly) {
        # Force token fetch up front so AEGIS_M365_CLIENT_SECRET errors
        # surface before we start iterating matters.
        [void](Get-AegisM365AppOnlyToken)
    }

    $matterFiles = Get-ChildItem -Path (Join-Path $Script:SeedDataRoot 'matters') -Filter '*.json'

    # Per-owner readiness cache. A user with N docs across the run only
    # gets probed once. Keyed by owner.id.
    $driveReady = @{}

    foreach ($matterFile in $matterFiles) {
        $matter = Get-Content -Raw -Path $matterFile.FullName | ConvertFrom-Json -Depth 32
        if (-not $matter.PSObject.Properties['onedrive']) { continue }

        Write-Host ""
        Write-Host "  Matter: $($matter.matterId)" -ForegroundColor White

        foreach ($doc in $matter.onedrive) {
            $owner = $UserMap[$doc.userKey]
            if (-not $owner -or -not $owner.id) {
                Write-Warn "    $($doc.fileName) — owner '$($doc.userKey)' not found, skipping"
                continue
            }

            if (-not $driveReady.ContainsKey($owner.id)) {
                $driveReady[$owner.id] = Test-AegisOneDriveReady -OwnerId $owner.id -OwnerUpn $owner.upn
            }
            if (-not $driveReady[$owner.id]) {
                # Probe already wrote one Write-Warn for this owner; stay quiet
                # for subsequent docs to avoid a wall of duplicate noise.
                continue
            }

            # Existence check. Only HTTP 404 is treated as "doesn't exist".
            # Auth, network, throttle, and 5xx errors propagate so the run
            # stops with a real error rather than silently skipping the upload.
            $existing = $null
            try {
                $existing = Invoke-AegisM365GraphAppOnly `
                    -Method GET `
                    -Path "/v1.0/users/$($owner.id)/drive/root:/$($doc.fileName)"
            } catch {
                $statusCode = $null
                try {
                    if ($_.Exception -and $_.Exception.Response) {
                        $statusCode = [int]$_.Exception.Response.StatusCode
                    }
                } catch {}
                if ($statusCode -ne 404) {
                    throw "Existence check failed for $($owner.upn):/$($doc.fileName) (status ${statusCode}): $($_.Exception.Message)"
                }
                # 404 → file is genuinely absent; fall through to upload path.
            }

            if ($VerifyOnly) {
                if ($existing) {
                    Write-Ok "    $($owner.upn):/$($doc.fileName) — present"
                } else {
                    Write-Warn "    $($owner.upn):/$($doc.fileName) — MISSING"
                }
                continue
            }

            if ($existing) {
                Write-Skip "    $($owner.upn):/$($doc.fileName) — already present"
                continue
            }

            try {
                $bytes = New-DocumentBytes -TemplateKey $doc.templateKey -FileName $doc.fileName

                $token = Get-AegisM365AppOnlyToken
                $url = "https://graph.microsoft.com/v1.0/users/$($owner.id)/drive/root:/$($doc.fileName):/content"

                [void](& $Script:AegisOneDriveUploadInvoker $url $token $bytes 'application/octet-stream')

                Write-Ok "    $($owner.upn):/$($doc.fileName) — uploaded"
            } catch {
                Write-Fail `
                    "OneDrive upload failed: $($owner.upn):/$($doc.fileName)." `
                    ("Error: $($_.Exception.Message)`n" +
                     "Common causes:`n" +
                     "  • User's OneDrive provisioning still in flight (probe may have passed`n" +
                     "    seconds before the upload race; re-run will pick it up).`n" +
                     "  • Transient network or Graph throttle.`n" +
                     "  • App registration missing Files.ReadWrite.All Application permission`n" +
                     "    (admin-consented).`n" +
                     "  • AEGIS_M365_CLIENT_SECRET expired or rotated.`n" +
                     "Re-run the orchestrator to retry; idempotency will skip what's already uploaded.")
                throw
            }
        }
    }

    Write-Ok "OneDrive content seeding complete."
}
