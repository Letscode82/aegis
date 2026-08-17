#!/usr/bin/env pwsh
<#
    seed-priya-dsar-mailbox.ps1 — DSAR demo data, into a REAL mailbox.

    Drops a controlled set of 12 messages into a data subject's Exchange
    Online mailbox so the DSAR demo runs end-to-end on live M365 data:
    6 messages clearly contain the subject's personal data, 6 are noise
    (group notices, backups, company-wide announcements). AEGIS's DSAR
    collection then pulls them via /users/{id}/messages, the AI relevance
    review scores them, a human validates, and the package is delivered.

    Auth: app-only (client credentials against the AEGIS app registration),
    same model as scripts/helpers/05-seed-mailbox-content.ps1 — creating a
    message in another user's mailbox needs APPLICATION Mail.ReadWrite;
    delegated admin is rejected by the Graph permission model.

    Required app permissions (admin-consented): Mail.ReadWrite, User.Read.All.
    Required env: AEGIS_M365_CLIENT_SECRET (+ the tenant/client id the other
    helpers already read). If you've run helper 05 for Marcus, you're set.

    Idempotent: every seeded message is tagged with the category
    "AEGIS-DSAR-DEMO". The script deletes previously-tagged messages first,
    then re-creates the set — so re-running gives a clean, identical inbox.

    Usage:
      ./scripts/seed-priya-dsar-mailbox.ps1 -UserUpn priya.kulkarni@<tenant>.onmicrosoft.com
      ./scripts/seed-priya-dsar-mailbox.ps1 -UserUpn <upn> -Clear   # remove only
#>
[CmdletBinding()]
param(
    [string]$UserUpn = "priya.kulkarni@6bs6wq.onmicrosoft.com",
    [switch]$Clear
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'helpers/_lib.ps1')
. (Join-Path $PSScriptRoot 'helpers/_app-only-auth.ps1')

$Category = 'AEGIS-DSAR-DEMO'
$SubjectName = ($UserUpn.Split('@')[0] -replace '\.', ' ')
$SubjectName = (Get-Culture).TextInfo.ToTitleCase($SubjectName)
$Domain = $UserUpn.Split('@')[1]

Write-Host "→ Resolving $UserUpn …" -ForegroundColor Cyan
$user = Invoke-AegisM365GraphAppOnly -Method GET -Path "/v1.0/users/$UserUpn?`$select=id,displayName,mail,userPrincipalName"
$userId = $user.id
if (-not $userId) { throw "Could not resolve $UserUpn to a Graph user id." }
Write-Host "  ✓ $($user.displayName) ($userId)" -ForegroundColor Green

# ── Clear previously-seeded messages (idempotency) ──────────────────
Write-Host "→ Removing any previously-seeded demo messages …" -ForegroundColor Cyan
$existing = Invoke-AegisM365GraphAppOnly -Method GET -Path "/v1.0/users/$userId/messages?`$filter=categories/any(c:c eq '$Category')&`$select=id&`$top=100"
$removed = 0
foreach ($m in @($existing.value)) {
    Invoke-AegisM365GraphAppOnly -Method DELETE -Path "/v1.0/users/$userId/messages/$($m.id)" | Out-Null
    $removed++
}
Write-Host "  ✓ removed $removed" -ForegroundColor Green
if ($Clear) { Write-Host "Done (clear only)." -ForegroundColor Green; return }

# ── The controlled record set ───────────────────────────────────────
# relevant = contains the subject's personal data; noise = not.
$records = @(
    @{ rel = $true;  from = "hr@$Domain";        name = "HR Operations";        subj = "Your employment record — $SubjectName";            body = "Hi $SubjectName, we've updated your employment record: job title (VP Engineering), salary band, start date, reporting manager, and emergency contact. Please review and confirm." }
    @{ rel = $true;  from = "benefits@$Domain";   name = "Benefits Team";        subj = "2026 benefits enrollment confirmation";            body = "$SubjectName, this confirms your 2026 health and dental enrollment, including your listed dependents. Your monthly contribution and coverage tier are attached." }
    @{ rel = $true;  from = "marketing@$Domain";  name = "Marketing";            subj = "You're subscribed to the product newsletter";      body = "You (${UserUpn}) opted in to the product newsletter and event invitations on 15 Jan 2026. You can update your marketing preferences at any time." }
    @{ rel = $true;  from = "crm-system@$Domain"; name = "CRM System";           subj = "Contact profile updated";                          body = "The contact profile for $SubjectName was updated: work phone, mobile, and mailing address. Account activity history is on record." }
    @{ rel = $true;  from = "manager@$Domain";    name = "Reporting Manager";    subj = "Your 2025 performance review";                     body = "$SubjectName, your annual performance review is ready: ratings, manager comments, and the compensation recommendation. Let's discuss in our 1:1." }
    @{ rel = $true;  from = "support@$Domain";    name = "IT Service Desk";      subj = "Support ticket #4821 resolved — account access";   body = "Hi $SubjectName, ticket #4821 is resolved. For the record it captured your email, device, IP address, and browser at the time of the login issue." }

    @{ rel = $false; from = "groups@$Domain";     name = "Microsoft 365 Groups"; subj = "You've joined the Legal Team Site group";          body = "This is an automated notification that you were added to the Legal Team Site group. No action needed." }
    @{ rel = $false; from = "groups@$Domain";     name = "Microsoft 365 Groups"; subj = "You've joined the Contracts Repository group";     body = "This is an automated notification that you were added to the Contracts Repository group. No action needed." }
    @{ rel = $false; from = "it-ops@$Domain";     name = "IT Operations";        subj = "Nightly backup completed — cluster 7";             body = "System notice: the nightly backup completed successfully. 4.2 TB across 118 databases. No personal data in this message." }
    @{ rel = $false; from = "events@$Domain";     name = "Company Events";       subj = "All-hands reminder — Friday 10:00";                body = "Reminder to all staff: the company all-hands is this Friday at 10:00 in the main hall and on Teams." }
    @{ rel = $false; from = "facilities@$Domain"; name = "Facilities";           subj = "Office closure — public holiday";                  body = "The office will be closed Monday for the public holiday. Sent to all employees." }
    @{ rel = $false; from = "product@$Domain";    name = "Product Team";         subj = "Q3 product roadmap deck";                          body = "Sharing the Q3 product roadmap deck for review. Strategy and timelines only; no personal data about any individual." }
)

Write-Host "→ Seeding $($records.Count) messages into $UserUpn …" -ForegroundColor Cyan
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
    Invoke-AegisM365GraphAppOnly -Method POST -Path "/v1.0/users/$userId/mailFolders/inbox/messages" -Body $msg | Out-Null
    $tag = if ($r.rel) { "PII " } else { "noise" }
    Write-Host ("  ✓ [{0}] {1}" -f $tag, $r.subj) -ForegroundColor DarkGray
}

$pii = @($records | Where-Object { $_.rel }).Count
$noise = @($records | Where-Object { -not $_.rel }).Count
Write-Host ""
Write-Host "✓ Seeded $($records.Count) messages ($pii with personal data, $noise noise) into $UserUpn." -ForegroundColor Green
Write-Host "Now run the DSAR demo in AEGIS: New request → search directory → pick $SubjectName → verify → Data inventory (Discover from M365) → Review (Search & collect) → Run AI review → Accept all → Deliver." -ForegroundColor Green
