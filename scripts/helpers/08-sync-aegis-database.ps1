#!/usr/bin/env pwsh
<#
    08-sync-aegis-database.ps1 — Hand off to TypeScript for AEGIS DB
    sync. PowerShell handles M365; TypeScript handles Postgres
    (uses the existing @aegis/db Prisma client).

    The TS helper reads the same seed-data/users.json and matter
    manifests, plus the M365 user ids from seed-state.json (so
    Person.metadata can carry the Graph user id for future
    integrations), and upserts:
      - 10 Person rows tagged seedBatch=m365-2026-05
      - 4 matters (3 new + the existing m-snowflake-msa)
      - MatterParty rows linking custodians to their matters
      - Optionally: draft Legal Holds per matter
#>

. (Join-Path $PSScriptRoot '_lib.ps1')

function Invoke-SyncAegisDatabase {
    [CmdletBinding()]
    param(
        [switch]$WithDraftHolds,
        [switch]$VerifyOnly
    )

    Write-Step "Syncing AEGIS database"

    if (-not $env:DATABASE_URL) {
        Write-Fail `
            "DATABASE_URL is not set." `
            ("Set it before running — for example:`n" +
             "  `$env:DATABASE_URL = (Get-Content apps\web\.env.production | Select-String 'DATABASE_URL=').Line -replace 'DATABASE_URL=`"' -replace '`"`$'`n" +
             "Or paste it directly. The TypeScript helper needs Postgres reach.")
        throw "DATABASE_URL missing."
    }

    $repoRoot = Split-Path -Parent $Script:ScriptsRoot
    $tsScript = Join-Path $Script:ScriptsRoot 'seed-aegis-from-m365.ts'
    if (-not (Test-Path $tsScript)) {
        Write-Fail "TS helper not found at $tsScript."
        throw "Missing seed-aegis-from-m365.ts"
    }

    Push-Location $repoRoot
    try {
        $args = @('--filter', '@aegis/db', 'exec', 'tsx', $tsScript)
        if ($WithDraftHolds) { $args += '--with-draft-holds' }
        if ($VerifyOnly)     { $args += '--verify-only' }

        Write-Host "  Running: pnpm $($args -join ' ')" -ForegroundColor DarkGray
        & pnpm @args
        if ($LASTEXITCODE -ne 0) {
            Write-Fail `
                "AEGIS DB sync failed (exit code $LASTEXITCODE)." `
                ("Inspect the output above. Common causes:`n" +
                 "  - Postgres unreachable: verify DATABASE_URL`n" +
                 "  - @aegis/db not built: run `pnpm --filter @aegis/db build`")
            throw "AEGIS sync failed."
        }
    } finally {
        Pop-Location
    }

    Write-Ok "AEGIS database sync complete."
}
