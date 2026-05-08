#!/usr/bin/env pwsh
<#
    06-seed-onedrive-content.ps1 — Upload generated documents to each
    user's OneDrive root.

    Idempotency: by file name in the user's drive root. Skip if
    present. The byte content is regenerated each run from
    documents/index.json.
#>

. (Join-Path $PSScriptRoot '_lib.ps1')
. (Join-Path $PSScriptRoot '_docgen.ps1')

Import-Module Microsoft.Graph.Files -ErrorAction Stop

function Invoke-SeedOneDriveContent {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $UserMap,
        [switch]$VerifyOnly
    )

    Write-Step "Seeding OneDrive content"

    $matterFiles = Get-ChildItem -Path (Join-Path $Script:SeedDataRoot 'matters') -Filter '*.json'

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
            $isDisabled = (Get-MgUser -UserId $owner.id -Property 'accountEnabled').AccountEnabled -eq $false
            if ($isDisabled -and -not $VerifyOnly) {
                # Disabled users can't have files written via Graph in some
                # tenant configs. Try anyway; surface failure clearly if it
                # blocks the run.
            }

            $existing = $null
            try {
                $existing = Invoke-MgGraphRequest -Method GET `
                    -Uri "/v1.0/users/$($owner.id)/drive/root:/$($doc.fileName)"
            } catch {
                $existing = $null
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
                # Graph PUT to /drive/root:/<path>:/content uploads byte content directly.
                # PowerShell parameter binding for binary requires -InputObject byte[].
                Invoke-MgGraphRequest -Method PUT `
                    -Uri "/v1.0/users/$($owner.id)/drive/root:/$($doc.fileName):/content" `
                    -ContentType 'application/octet-stream' `
                    -Body $bytes | Out-Null
                Write-Ok "    $($owner.upn):/$($doc.fileName) — uploaded"
            } catch {
                Write-Fail `
                    "OneDrive upload failed: $($owner.upn):/$($doc.fileName)." `
                    ("Error: $($_.Exception.Message)`n" +
                     "Common cause: OneDrive not yet provisioned. Microsoft provisions OneDrive`n" +
                     "5-15 min after license assignment. Re-run to retry.")
                throw
            }
        }
    }

    Write-Ok "OneDrive content seeding complete."
}
