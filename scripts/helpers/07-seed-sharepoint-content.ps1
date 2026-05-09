#!/usr/bin/env pwsh
<#
    07-seed-sharepoint-content.ps1 — Upload documents to the seeded
    SharePoint sites' default document library, creating folder
    structure as specified in matter manifests.

    Idempotency: by file name within target folder. Skip if present.
    Folders auto-created via Graph driveItem POST.

    Followed sites: as a final pass, ensure each user "follows" the
    sites their matter manifests place them on. AEGIS auto-discovery
    reads /users/{id}/followedSites — without the follow, the wizard
    won't surface those sites.
#>

. (Join-Path $PSScriptRoot '_lib.ps1')
. (Join-Path $PSScriptRoot '_docgen.ps1')

Import-Module Microsoft.Graph.Files -ErrorAction Stop
Import-Module Microsoft.Graph.Sites -ErrorAction Stop

function Resolve-SiteDriveId {
    param([Parameter(Mandatory)][string]$SiteId)
    $drive = Invoke-MgGraphRequest -Method GET -Uri "/v1.0/sites/$SiteId/drive"
    return $drive.id
}

function Confirm-SharePointFolderPath {
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$DriveId,
        [Parameter(Mandatory)][string]$FolderPath  # forward-slash-separated, no leading slash
    )
    if (-not $FolderPath -or $FolderPath -eq '/') { return }

    $segments = $FolderPath -split '/' | Where-Object { $_ }
    $current = ''
    foreach ($seg in $segments) {
        $next = if ($current) { "$current/$seg" } else { $seg }
        try {
            Invoke-MgGraphRequest -Method GET `
                -Uri "/v1.0/drives/$DriveId/root:/$next" | Out-Null
        } catch {
            # Create the folder under its parent
            $parent = if ($current) { "/v1.0/drives/$DriveId/root:/${current}:/children" } else { "/v1.0/drives/$DriveId/root/children" }
            $body = @{
                name                                = $seg
                folder                              = @{}
                '@microsoft.graph.conflictBehavior' = 'replace'
            }
            Invoke-MgGraphRequest -Method POST -Uri $parent -Body ($body | ConvertTo-Json -Depth 4) -ContentType 'application/json' | Out-Null
        }
        $current = $next
    }
}

function Invoke-SeedSharePointContent {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $UserMap,
        [Parameter(Mandatory)] $SiteMap,
        [switch]$VerifyOnly
    )

    Write-Step "Seeding SharePoint content"

    $matterFiles = Get-ChildItem -Path (Join-Path $Script:SeedDataRoot 'matters') -Filter '*.json'

    # Cache drive ids per site
    $driveCache = @{}

    foreach ($matterFile in $matterFiles) {
        $matter = Get-Content -Raw -Path $matterFile.FullName | ConvertFrom-Json -Depth 32
        if (-not $matter.PSObject.Properties['sharepoint']) { continue }

        $siteSpec = $SiteMap[$matter.sharepoint.siteKey]
        if (-not $siteSpec -or -not $siteSpec.siteId) {
            Write-Warn "  Matter $($matter.matterId): site '$($matter.sharepoint.siteKey)' not provisioned, skipping"
            continue
        }

        Write-Host ""
        Write-Host "  Matter: $($matter.matterId) → /sites/$($siteSpec.urlSlug)" -ForegroundColor White

        if (-not $driveCache.ContainsKey($siteSpec.siteId)) {
            $driveCache[$siteSpec.siteId] = Resolve-SiteDriveId -SiteId $siteSpec.siteId
        }
        $driveId = $driveCache[$siteSpec.siteId]

        foreach ($doc in $matter.sharepoint.documents) {
            $folderPath = $doc.folder
            $fullPath = if ($folderPath) { "$folderPath/$($doc.fileName)" } else { $doc.fileName }

            $existing = $null
            try {
                $existing = Invoke-MgGraphRequest -Method GET -Uri "/v1.0/drives/$driveId/root:/$fullPath"
            } catch {
                $existing = $null
            }

            if ($VerifyOnly) {
                if ($existing) {
                    Write-Ok "    $fullPath — present"
                } else {
                    Write-Warn "    $fullPath — MISSING"
                }
                continue
            }

            if ($existing) {
                Write-Skip "    $fullPath — already present"
                continue
            }

            if ($folderPath) {
                Confirm-SharePointFolderPath -SiteId $siteSpec.siteId -DriveId $driveId -FolderPath $folderPath
            }

            try {
                $bytes = New-DocumentBytes -TemplateKey $doc.templateKey -FileName $doc.fileName
                Invoke-MgGraphRequest -Method PUT `
                    -Uri "/v1.0/drives/$driveId/root:/$fullPath`:/content" `
                    -ContentType 'application/octet-stream' `
                    -Body $bytes | Out-Null
                Write-Ok "    $fullPath — uploaded"
            } catch {
                Write-Fail `
                    "SharePoint upload failed: $fullPath." `
                    ("Error: $($_.Exception.Message)`n" +
                     "Common cause: site permissions still propagating, or file path contains invalid SharePoint characters.`n" +
                     "Allowed characters in SharePoint paths: letters, digits, spaces, and -_.()&" )
                throw
            }
        }
    }

    if ($VerifyOnly) { return }

    # Ensure each member follows the sites they're listed on.
    Write-Step "Ensuring users follow their sites"
    $sitesSpec = (Get-SeedJson 'sites.json').sites
    foreach ($spec in $sitesSpec) {
        $siteRecord = $SiteMap[$spec.key]
        if (-not $siteRecord -or -not $siteRecord.siteId) { continue }
        foreach ($memberKey in $spec.members) {
            $u = $UserMap[$memberKey]
            if (-not $u -or -not $u.id) { continue }
            try {
                $body = @{ value = @(@{ id = $siteRecord.siteId }) }
                Invoke-MgGraphRequest -Method POST `
                    -Uri "/v1.0/users/$($u.id)/followedSites/add" `
                    -Body ($body | ConvertTo-Json -Depth 4) `
                    -ContentType 'application/json' | Out-Null
            } catch {
                # 409-shaped responses are normal when already following — swallow.
                if ($_.Exception.Message -notmatch '409|already|conflict') {
                    Write-Warn "  Could not mark $($u.upn) as following /sites/$($spec.urlSlug): $($_.Exception.Message)"
                }
            }
        }
        Write-Ok "/sites/$($spec.urlSlug) — followed by $($spec.members.Count) member(s)"
    }

    Write-Ok "SharePoint content seeding complete."
}
