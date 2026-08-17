#!/usr/bin/env pwsh
<#
    seed-investigation-mailbox.ps1 - eDiscovery / legal-hold collection demo
    data, into one or more REAL tenant mailboxes.

    Self-contained: no dependency on the scripts/helpers framework, so it runs
    in Windows PowerShell 5.1 as well as PowerShell 7. Pure ASCII on purpose
    (Windows PowerShell 5.1 reads UTF-8-without-BOM files as ANSI).

    Drops a controlled, investigation-flavored set of messages into each
    custodian's Exchange Online mailbox so the Hold -> Collection -> Review-set
    -> Run AI review -> Produce flow runs end-to-end on live M365 data. The set
    is DELIBERATELY MIXED so the AI review has real routing signal:
      - RESPONSIVE : the Snowflake MSA vendor negotiation (pricing, Net 30/45,
                     IP section 8.2) - what the collection is looking for.
      - PRIVILEGED : outside-counsel advice marked attorney-client privileged /
                     work product - the review engine routes these to ATTORNEY.
      - PII        : messages carrying a home address / personal phone.
      - NOISE      : all-hands, backups, lunch - the AI auto-culls these.

    AEGIS's hold collection pulls them via /users/{id}/messages (per-user Graph
    endpoint - honors application permissions, unlike /search/query).

    Auth: app-only client-credentials against the AEGIS app registration
    (creating a message in another user's mailbox needs APPLICATION
    Mail.ReadWrite; delegated admin is rejected by the Graph permission model).
    Required app permissions (admin-consented): Mail.ReadWrite, User.Read.All.

    Config (env or -param): AEGIS_M365_CLIENT_SECRET is the only required one;
    tenant/client id default to the AEGIS app registration.

    Idempotent: seeded messages are tagged category "AEGIS-INVESTIGATION-DEMO";
    the script deletes previously-tagged messages first, then re-creates the set.

    Usage:
      .\scripts\seed-investigation-mailbox.ps1 -Mailboxes "priya.kulkarni@<tenant>,marcus.reid@<tenant>"
      .\scripts\seed-investigation-mailbox.ps1 -Mailboxes "priya.kulkarni@<tenant>" -Clear
#>
[CmdletBinding()]
param(
    [string]$Mailboxes = "priya.kulkarni@6bs6wq.onmicrosoft.com,marcus.reid@6bs6wq.onmicrosoft.com",
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

$Category = 'AEGIS-INVESTIGATION-DEMO'
$MailboxList = @($Mailboxes.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($MailboxList.Count -eq 0) { throw "No mailboxes given. Pass -Mailboxes 'a@tenant,b@tenant'." }

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

# --- The controlled record set. cat = RESPONSIVE | PRIVILEGED | PII | NOISE ---
function Get-Records([string]$Domain, [string]$Name, [string]$Upn) {
    return @(
        @{ cat = "RESPONSIVE"; from = "procurement@$Domain"; fname = "Procurement"; subj = "Snowflake MSA renewal - vendorx pricing (Net 30 vs Net 45)"; body = "Team, the Snowflake MSA renewal is stuck on payment terms. Vendorx proposed Net 30; we want Net 45. Attaching the redlined pricing schedule and the discount tiers for the re-papering." }
        @{ cat = "RESPONSIVE"; from = "$($Upn)";             fname = $Name;         subj = "RE: IP section 8.2 ambiguity - Snowflake MSA"; body = "Looping engineering in. Section 8.2 (IP ownership of derived models) is ambiguous on jointly-developed work. We need a position before the negotiation call with vendorx on Thursday." }
        @{ cat = "RESPONSIVE"; from = "finance@$Domain";     fname = "Finance";     subj = "Invoice dispute - vendorx Q1 usage overage"; body = "The vendorx Q1 invoice includes a usage overage we did not approve under the current MSA. Flagging for the renewal negotiation; do not pay until pricing is re-papered." }
        @{ cat = "RESPONSIVE"; from = "eng-lead@$Domain";    fname = "Eng Lead";    subj = "Data pipeline dependency on Snowflake before renewal"; body = "Reminder that three production pipelines depend on the Snowflake contract. If the MSA renewal slips past the deadline we lose the committed-use discount. Please prioritize the section 8.2 review." }
        @{ cat = "RESPONSIVE"; from = "vendor-mgmt@$Domain"; fname = "Vendor Mgmt"; subj = "vendorx negotiation - counterparty proposal summary"; body = "Summary of the counterparty proposal: 12-month term, auto-renew, Net 30, and a broad IP assignment clause. Recommend pushing back on Net 30 and narrowing section 8.2." }

        @{ cat = "PRIVILEGED"; from = "outside.counsel@wilsonpartners.example"; fname = "Wilson Partners LLP"; subj = "PRIVILEGED AND CONFIDENTIAL - Attorney-Client - Snowflake MSA IP risk"; body = "ATTORNEY-CLIENT PRIVILEGED AND CONFIDENTIAL. ATTORNEY WORK PRODUCT. Our legal advice on section 8.2: as drafted, the IP assignment likely transfers jointly-developed model weights to the vendor. Do not share outside the legal team. This memo is privileged." }
        @{ cat = "PRIVILEGED"; from = "gc@$Domain";                            fname = "Office of the GC"; subj = "Privileged - litigation risk if we miss the renewal window"; body = "PRIVILEGED AND CONFIDENTIAL - prepared at the request of counsel. Our litigation exposure if vendorx alleges breach: summary of outside counsel's assessment and recommended negotiating posture. Legal advice - do not forward." }

        @{ cat = "PII";        from = "hr@$Domain";       fname = "HR Operations"; subj = "Your updated contact record on file"; body = "Hi $Name, we updated your personal contact record: home address 4821 Maple Court, Springfield, and mobile phone 415-555-0182. Please confirm these are current." }

        @{ cat = "NOISE";      from = "events@$Domain";     fname = "Company Events"; subj = "All-hands reminder - Friday 10:00"; body = "Reminder to all staff: the company all-hands is this Friday at 10:00 in the main hall and on Teams. No action needed." }
        @{ cat = "NOISE";      from = "it-ops@$Domain";     fname = "IT Operations";  subj = "Nightly backup completed - cluster 7"; body = "System notice: the nightly backup completed successfully. 4.2 TB across 118 databases. No action needed." }
        @{ cat = "NOISE";      from = "facilities@$Domain"; fname = "Facilities";     subj = "Lunch menu - week of the 14th"; body = "This week's cafeteria menu is attached. Taco Tuesday returns. Sent to all employees." }
    )
}

$grandTotal = 0
foreach ($UserUpn in $MailboxList) {
    Write-Host ""
    Write-Host "=== $UserUpn ===" -ForegroundColor Cyan
    $SubjectName = ($UserUpn.Split('@')[0] -replace '\.', ' ')
    $SubjectName = (Get-Culture).TextInfo.ToTitleCase($SubjectName)
    $Domain = $UserUpn.Split('@')[1]

    Write-Host "Resolving $UserUpn ..." -ForegroundColor Cyan
    $user = Invoke-Graph GET "/v1.0/users/$UserUpn`?`$select=id,displayName"
    $userId = $user.id
    if (-not $userId) { throw "Could not resolve $UserUpn to a Graph user id." }
    Write-Host "  OK $($user.displayName) ($userId)" -ForegroundColor Green

    # Clear previously-seeded (client-side category match)
    $inbox = Invoke-Graph GET "/v1.0/users/$userId/mailFolders/inbox/messages`?`$top=100&`$select=id,categories"
    $removed = 0
    foreach ($m in @($inbox.value)) {
        if ($m.categories -and ($m.categories -contains $Category)) {
            Invoke-Graph DELETE "/v1.0/users/$userId/messages/$($m.id)" | Out-Null
            $removed++
        }
    }
    Write-Host "  removed $removed previously-seeded" -ForegroundColor Green
    if ($Clear) { continue }

    $records = Get-Records $Domain $SubjectName $UserUpn
    $now = Get-Date
    $i = 0
    foreach ($r in $records) {
        $i++
        $received = $now.AddHours(-2 * $i).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        $msg = @{
            subject          = $r.subj
            body             = @{ contentType = "HTML"; content = "<p>$($r.body)</p>" }
            from             = @{ emailAddress = @{ address = $r.from; name = $r.fname } }
            sender           = @{ emailAddress = @{ address = $r.from; name = $r.fname } }
            toRecipients     = @(@{ emailAddress = @{ address = $UserUpn; name = $SubjectName } })
            receivedDateTime = $received
            sentDateTime     = $received
            isRead           = $false
            categories       = @($Category)
        }
        Invoke-Graph POST "/v1.0/users/$userId/mailFolders/inbox/messages" $msg | Out-Null
        Write-Host ("  [{0,-10}] {1}" -f $r.cat, $r.subj) -ForegroundColor DarkGray
        $grandTotal++
    }
    Write-Host "  seeded $($records.Count) into $UserUpn" -ForegroundColor Green
}

if ($Clear) { Write-Host "`nDone (clear only)." -ForegroundColor Green; return }
Write-Host ""
Write-Host "Seeded $grandTotal messages across $($MailboxList.Count) mailbox(es)." -ForegroundColor Green
Write-Host "Now in AEGIS: Matter -> Snowflake MSA -> Legal Hold -> LH-2026-0001 -> Collection -> Preview -> Commit -> open the review set -> Run AI review -> code -> Freeze -> Produce." -ForegroundColor Green
