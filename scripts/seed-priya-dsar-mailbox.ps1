#!/usr/bin/env pwsh
<#
    seed-priya-dsar-mailbox.ps1 - DSAR demo data, into a REAL mailbox.

    Self-contained: no dependency on the scripts/helpers framework, so it runs
    in Windows PowerShell 5.1 as well as PowerShell 7. Pure ASCII on purpose
    (Windows PowerShell 5.1 reads UTF-8-without-BOM files as ANSI).

    Drops a controlled set of 12 messages into a data subject's Exchange Online
    mailbox so the DSAR demo runs end-to-end on live M365 data: 6 messages
    clearly contain the subject's personal data, 6 are noise. AEGIS's DSAR
    collection then pulls them via /users/{id}/messages for the AI relevance
    review.

    Auth: app-only client-credentials against the AEGIS app registration
    (creating a message in another user's mailbox needs APPLICATION
    Mail.ReadWrite; delegated admin is rejected by the Graph permission model).
    Required app permissions (admin-consented): Mail.ReadWrite, User.Read.All.

    Config (env or -param): AEGIS_M365_CLIENT_SECRET is the only required one;
    tenant/client id default to the AEGIS app registration.

    Idempotent: seeded messages are tagged category "AEGIS-DSAR-DEMO"; the
    script deletes previously-tagged messages first, then re-creates the set.

    Usage:
      .\scripts\seed-priya-dsar-mailbox.ps1 -UserUpn priya.kulkarni@<tenant>.onmicrosoft.com
      .\scripts\seed-priya-dsar-mailbox.ps1 -UserUpn <upn> -Clear
#>
[CmdletBinding()]
param(
    [string]$UserUpn = "priya.kulkarni@6bs6wq.onmicrosoft.com",
    [string]$TenantId = $(if ($env:AEGIS_M365_APP_TENANT_ID) { $env:AEGIS_M365_APP_TENANT_ID } else { '7972db8d-a6a7-4a54-ae82-ca5f8652fb3d' }),
    [string]$ClientId = $(if ($env:AEGIS_M365_APP_CLIENT_ID) { $env:AEGIS_M365_APP_CLIENT_ID } else { '94414388-9a8d-43a1-bd65-094798622f7d' }),
    [string]$ClientSecret = $env:AEGIS_M365_CLIENT_SECRET,
    [switch]$Clear
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if ([string]::IsNullOrWhiteSpace($ClientSecret)) {
    throw "AEGIS_M365_CLIENT_SECRET is not set. Set it (the app registration's client secret VALUE), or pass -ClientSecret."
}

$Category = 'AEGIS-DSAR-DEMO'
$SubjectName = ($UserUpn.Split('@')[0] -replace '\.', ' ')
$SubjectName = (Get-Culture).TextInfo.ToTitleCase($SubjectName)
$Domain = $UserUpn.Split('@')[1]

# --- App-only token ---
Write-Host "Getting app-only token ..." -ForegroundColor Cyan
$tokenBody = @{ client_id = $ClientId; client_secret = $ClientSecret; scope = 'https://graph.microsoft.com/.default'; grant_type = 'client_credentials' }
$tokenResp = Invoke-RestMethod -Method POST -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" -Body $tokenBody -ContentType 'application/x-www-form-urlencoded'
if (-not $tokenResp.access_token) { throw "Token request returned no access_token." }
$Headers = @{ Authorization = "Bearer $($tokenResp.access_token)" }

function Invoke-Graph {
    param([string]$Method, [string]$Path, [object]$Obj)
    $uri = "https://graph.microsoft.com$Path"
    if ($null -ne $Obj) {
        $json = $Obj | ConvertTo-Json -Depth 20
        return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers -Body $json -ContentType 'application/json'
    }
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers
}

# --- Resolve user ---
Write-Host "Resolving $UserUpn ..." -ForegroundColor Cyan
$user = Invoke-Graph GET "/v1.0/users/$UserUpn`?`$select=id,displayName,mail,userPrincipalName"
$userId = $user.id
if (-not $userId) { throw "Could not resolve $UserUpn to a Graph user id." }
Write-Host "  OK $($user.displayName) ($userId)" -ForegroundColor Green

# --- Clear previously-seeded messages (client-side category match) ---
Write-Host "Removing any previously-seeded demo messages ..." -ForegroundColor Cyan
$inbox = Invoke-Graph GET "/v1.0/users/$userId/mailFolders/inbox/messages`?`$top=100&`$select=id,categories"
$removed = 0
foreach ($m in @($inbox.value)) {
    if ($m.categories -and ($m.categories -contains $Category)) {
        Invoke-Graph DELETE "/v1.0/users/$userId/messages/$($m.id)" | Out-Null
        $removed++
    }
}
Write-Host "  removed $removed" -ForegroundColor Green
if ($Clear) { Write-Host "Done (clear only)." -ForegroundColor Green; return }

# --- The controlled record set. rel = contains the subject's personal data ---
$records = @(
    @{ rel = $true;  from = "hr@$Domain";        name = "HR Operations";        subj = "Your employment record - $SubjectName";            body = "Hi $SubjectName, we have updated your employment record: job title (VP Engineering), salary band, start date, reporting manager, and emergency contact. Please review and confirm." }
    @{ rel = $true;  from = "benefits@$Domain";   name = "Benefits Team";        subj = "2026 benefits enrollment confirmation";            body = "$SubjectName, this confirms your 2026 health and dental enrollment, including your listed dependents. Your monthly contribution and coverage tier are attached." }
    @{ rel = $true;  from = "marketing@$Domain";  name = "Marketing";            subj = "You are subscribed to the product newsletter";     body = "You ($UserUpn) opted in to the product newsletter and event invitations on 15 Jan 2026. You can update your marketing preferences at any time." }
    @{ rel = $true;  from = "crm-system@$Domain"; name = "CRM System";           subj = "Contact profile updated";                          body = "The contact profile for $SubjectName was updated: work phone, mobile, and mailing address. Account activity history is on record." }
    @{ rel = $true;  from = "manager@$Domain";    name = "Reporting Manager";    subj = "Your 2025 performance review";                     body = "$SubjectName, your annual performance review is ready: ratings, manager comments, and the compensation recommendation. Let us discuss in our 1:1." }
    @{ rel = $true;  from = "support@$Domain";    name = "IT Service Desk";      subj = "Support ticket #4821 resolved - account access";   body = "Hi $SubjectName, ticket #4821 is resolved. For the record it captured your email, device, IP address, and browser at the time of the login issue." }

    @{ rel = $false; from = "groups@$Domain";     name = "Microsoft 365 Groups"; subj = "You have joined the Legal Team Site group";        body = "This is an automated notification that you were added to the Legal Team Site group. No action needed." }
    @{ rel = $false; from = "groups@$Domain";     name = "Microsoft 365 Groups"; subj = "You have joined the Contracts Repository group";   body = "This is an automated notification that you were added to the Contracts Repository group. No action needed." }
    @{ rel = $false; from = "it-ops@$Domain";     name = "IT Operations";        subj = "Nightly backup completed - cluster 7";             body = "System notice: the nightly backup completed successfully. 4.2 TB across 118 databases. No personal data in this message." }
    @{ rel = $false; from = "events@$Domain";     name = "Company Events";       subj = "All-hands reminder - Friday 10:00";                body = "Reminder to all staff: the company all-hands is this Friday at 10:00 in the main hall and on Teams." }
    @{ rel = $false; from = "facilities@$Domain"; name = "Facilities";           subj = "Office closure - public holiday";                  body = "The office will be closed Monday for the public holiday. Sent to all employees." }
    @{ rel = $false; from = "product@$Domain";    name = "Product Team";         subj = "Q3 product roadmap deck";                          body = "Sharing the Q3 product roadmap deck for review. Strategy and timelines only; no personal data about any individual." }
)

Write-Host "Seeding $($records.Count) messages into $UserUpn ..." -ForegroundColor Cyan
$now = Get-Date
$i = 0
foreach ($r in $records) {
    $i++
    $received = $now.AddHours(-2 * $i).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $msg = @{
        subject          = $r.subj
        body             = @{ contentType = "HTML"; content = "<p>$($r.body)</p>" }
        from             = @{ emailAddress = @{ address = $r.from; name = $r.name } }
        sender           = @{ emailAddress = @{ address = $r.from; name = $r.name } }
        toRecipients     = @(@{ emailAddress = @{ address = $UserUpn; name = $SubjectName } })
        receivedDateTime = $received
        sentDateTime     = $received
        isRead           = $false
        categories       = @($Category)
    }
    Invoke-Graph POST "/v1.0/users/$userId/mailFolders/inbox/messages" $msg | Out-Null
    $tag = if ($r.rel) { "PII  " } else { "noise" }
    Write-Host ("  [{0}] {1}" -f $tag, $r.subj) -ForegroundColor DarkGray
}

$pii = @($records | Where-Object { $_.rel }).Count
$noise = @($records | Where-Object { -not $_.rel }).Count
Write-Host ""
Write-Host "Seeded $($records.Count) messages ($pii with personal data, $noise noise) into $UserUpn." -ForegroundColor Green
Write-Host "Now run the DSAR demo in AEGIS: New request -> pick $SubjectName -> verify -> Data inventory (Discover from M365) -> Review (Search & collect) -> Run AI review -> Accept all -> Deliver." -ForegroundColor Green
