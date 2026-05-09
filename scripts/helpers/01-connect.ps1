#!/usr/bin/env pwsh
<#
    01-connect.ps1 — Connect to Microsoft Graph with the scopes
    every downstream helper needs, and verify each one was granted.

    On first run the Microsoft Graph PowerShell SDK opens an
    interactive admin-consent prompt. On subsequent runs the cached
    token is reused.

    Fail-loud: if any required scope is missing after consent, this
    script tells the operator exactly which scopes to request and
    stops the orchestrator. No silent partial state.

    Dual-auth: directory ops (this file) stay on delegated.
    Cross-user mailbox / drive ops (helper 05+) use app-only
    via _app-only-auth.ps1 — see Get-AegisM365AppOnlyToken there.
#>

. (Join-Path $PSScriptRoot '_lib.ps1')
. (Join-Path $PSScriptRoot '_app-only-auth.ps1')

$RequiredScopes = @(
    'User.ReadWrite.All',
    'Directory.ReadWrite.All',
    'Sites.FullControl.All',
    'Sites.Manage.All',
    'Group.ReadWrite.All',
    'Mail.Send',
    'Mail.ReadWrite',
    'Files.ReadWrite.All',
    'LicenseAssignment.ReadWrite.All',
    'Organization.Read.All'
)

function Connect-AegisM365Graph {
    Write-Step "Connecting to Microsoft Graph"

    $tenant = Resolve-Tenant

    if (-not (Get-Module -ListAvailable -Name Microsoft.Graph)) {
        Write-Fail `
            "Microsoft Graph PowerShell SDK is not installed." `
            "Run: Install-Module Microsoft.Graph -Scope CurrentUser -Force"
        throw "Microsoft.Graph module missing."
    }

    Import-Module Microsoft.Graph.Authentication -ErrorAction Stop

    $existing = $null
    try { $existing = Get-MgContext } catch {}

    $needsConnect = $true
    if ($existing -and $existing.TenantId -and $existing.Scopes) {
        $missing = $RequiredScopes | Where-Object { $_ -notin $existing.Scopes }
        if (-not $missing) {
            Write-Ok "Already connected — tenant $($existing.TenantId), all scopes present."
            $needsConnect = $false
        } else {
            Write-Skip "Reconnecting — missing scopes: $($missing -join ', ')"
        }
    }

    if ($needsConnect) {
        Connect-MgGraph -Scopes $RequiredScopes -TenantId $tenant -NoWelcome | Out-Null
    }

    $ctx = Get-MgContext
    if (-not $ctx) {
        Write-Fail "Connect-MgGraph returned but Get-MgContext is null."
        throw "Graph connection failed."
    }

    $missing = $RequiredScopes | Where-Object { $_ -notin $ctx.Scopes }
    if ($missing) {
        Write-Fail `
            "Connected, but the following Graph scopes were NOT granted: $($missing -join ', ')" `
            ("An admin must consent. Either:`n" +
             "  1. Re-run and consent to all scopes when prompted, or`n" +
             "  2. Pre-consent in Entra: App registrations → Microsoft Graph PowerShell → API permissions → Grant admin consent.")
        throw "Graph scope check failed."
    }

    # Confirm tenant matches what the operator asked for
    $org = Get-MgOrganization | Select-Object -First 1
    $verifiedDomains = $org.VerifiedDomains | ForEach-Object { $_.Name }
    if ($tenant -notin $verifiedDomains) {
        Write-Warn "Connected tenant verified domains: $($verifiedDomains -join ', ')"
        Write-Warn "Operator asked for: $tenant"
        Write-Warn "Proceeding — tenant token resolves what Microsoft thinks the tenant is."
    }

    Write-Ok "Connected to tenant: $($ctx.TenantId)"
    Write-Ok "Account: $($ctx.Account)"
    Write-Ok "Scopes verified ($($RequiredScopes.Count) total)"

    return [pscustomobject]@{
        TenantId        = $ctx.TenantId
        Account         = $ctx.Account
        VerifiedDomains = $verifiedDomains
    }
}
