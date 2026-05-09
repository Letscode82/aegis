#!/usr/bin/env pwsh
<#
    04-create-sharepoint-sites.ps1 — Provision the 5 SharePoint team
    sites with members.

    Approach: We create each as an M365 group via Graph
    /groups (groupTypes=['Unified'], visibility='Private'). The
    group provisions a connected modern team site automatically.
    Owners and members are added as group memberships, which
    SharePoint mirrors into site permissions on its next sync.

    URLs end up at https://<tenant-prefix>.sharepoint.com/sites/<slug>
    once SharePoint provisioning catches up (typically <2 min after
    the group is created).
#>

. (Join-Path $PSScriptRoot '_lib.ps1')

Import-Module Microsoft.Graph.Groups -ErrorAction Stop
Import-Module Microsoft.Graph.Sites -ErrorAction Stop

function Invoke-CreateSharePointSites {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $UserMap,
        [switch]$VerifyOnly
    )

    Write-Step "Provisioning SharePoint sites (via M365 groups)"

    $sitesSpec = (Get-SeedJson 'sites.json').sites
    $tenant = Resolve-Tenant
    $tenantPrefix = ($tenant -split '\.')[0]
    $result = @{}

    foreach ($spec in $sitesSpec) {
        $mailNickname = "aegis-seed-$($spec.urlSlug)"
        $existing = Get-MgGroup -Filter "mailNickname eq '$mailNickname'" -ErrorAction SilentlyContinue | Select-Object -First 1

        if ($VerifyOnly) {
            if ($existing) {
                Write-Ok "/sites/$($spec.urlSlug) — group present (id $($existing.Id))"
            } else {
                Write-Warn "/sites/$($spec.urlSlug) — MISSING"
            }
            $result[$spec.key] = [pscustomobject]@{
                key          = $spec.key
                urlSlug      = $spec.urlSlug
                groupId      = $(if ($existing) { $existing.Id } else { $null })
                siteId       = $null
                webUrl       = $null
            }
            continue
        }

        $group = $existing
        if (-not $group) {
            $body = @{
                DisplayName     = $spec.displayName
                Description     = $spec.description
                MailNickname    = $mailNickname
                MailEnabled     = $true
                SecurityEnabled = $false
                GroupTypes      = @('Unified')
                Visibility      = 'Private'
            }
            try {
                $group = New-MgGroup -BodyParameter $body
                Write-Ok "/sites/$($spec.urlSlug) — group created (id $($group.Id))"
            } catch {
                Write-Fail `
                    "Failed to create group for /sites/$($spec.urlSlug)." `
                    ("Error: $($_.Exception.Message)`n" +
                     "If the error mentions mailNickname conflict, an old group with the same nickname exists.`n" +
                     "Run scripts/wipe-m365-tenant.ps1 -Confirm to clean up, or rename the slug in sites.json.")
                throw
            }
        } else {
            Write-Skip "/sites/$($spec.urlSlug) — group already exists"
        }

        # Add owners and members. Graph dedupes by id so re-running is
        # safe; we still wrap each in try/catch to ignore "already added"
        # errors gracefully without aborting.
        foreach ($ownerKey in $spec.owners) {
            $u = $UserMap[$ownerKey]
            if (-not $u -or -not $u.id) {
                Write-Warn "  Owner '$ownerKey' not in user map — skipping"
                continue
            }
            try {
                New-MgGroupOwnerByRef -GroupId $group.Id -BodyParameter @{
                    '@odata.id' = "https://graph.microsoft.com/v1.0/users/$($u.id)"
                } -ErrorAction Stop
            } catch {
                if ($_.Exception.Message -notmatch 'already exist|references already exist') { throw }
            }
        }
        foreach ($memberKey in $spec.members) {
            $u = $UserMap[$memberKey]
            if (-not $u -or -not $u.id) {
                Write-Warn "  Member '$memberKey' not in user map — skipping"
                continue
            }
            try {
                New-MgGroupMemberByRef -GroupId $group.Id -BodyParameter @{
                    '@odata.id' = "https://graph.microsoft.com/v1.0/users/$($u.id)"
                } -ErrorAction Stop
            } catch {
                if ($_.Exception.Message -notmatch 'already exist|references already exist') { throw }
            }
        }
        Write-Ok "  Owners + members synced"

        # Resolve the connected site. SharePoint provisioning lags the
        # group by 30s–2min on first creation.
        $site = $null
        Wait-For -Description "Site provisioning: /sites/$($spec.urlSlug)" -TimeoutSeconds 300 -IntervalSeconds 15 -Predicate {
            try {
                $resolved = Invoke-MgGraphRequest -Method GET `
                    -Uri "/v1.0/groups/$($group.Id)/sites/root"
                if ($resolved -and $resolved.id) {
                    $script:resolvedSite = $resolved
                    return $true
                }
                return $false
            } catch {
                return $false
            }
        }
        $site = $script:resolvedSite
        Write-Ok "  Web URL: $($site.webUrl)"

        $result[$spec.key] = [pscustomobject]@{
            key       = $spec.key
            urlSlug   = $spec.urlSlug
            groupId   = $group.Id
            siteId    = $site.id
            webUrl    = $site.webUrl
        }
        Set-SeedStateMark -Bucket 'sites' -Key $spec.key -Value @{
            groupId = $group.Id
            siteId  = $site.id
            webUrl  = $site.webUrl
        }
    }

    Write-Ok "SharePoint site provisioning complete."
    return $result
}
