#!/usr/bin/env pwsh
<#
    seed-demo-suite.ps1 - one-shot demo dataset for AEGIS across multiple
    investigation types, into REAL tenant mailboxes.

    Seeds several DISTINCT matters at once so every demo has real, varied
    material and you never have to re-seed:
      - MSA / IP dispute (Snowflake MSA, vendorx section 8.2)     -> legal hold, culling, AI review, production
      - HR internal investigation (workplace-conduct complaint)   -> sensitive investigation, privilege, PII
      - Trade-secret / departing employee (exfiltration)          -> departed-custodian preservation, hot docs
      - DSAR (Priya) is seeded separately by seed-priya-dsar-mailbox.ps1

    Each scenario is tagged with its OWN category so it is independently
    idempotent - re-run or -Clear one scenario without touching the others.
    Every custodian's slice carries routing signal: RESPONSIVE -> Reviewer,
    PRIVILEGED (attorney-client) -> Attorney, PII -> Reviewer, NOISE -> Auto-cull.

    Self-contained + pure ASCII (runs in Windows PowerShell 5.1 and PS 7).
    App-only client-credentials; required app permissions (admin-consented):
    Mail.ReadWrite, User.Read.All.

    Usage:
      $env:AEGIS_M365_CLIENT_SECRET = "<client secret VALUE>"
      .\scripts\seed-demo-suite.ps1 -Tenant 6bs6wq.onmicrosoft.com
      .\scripts\seed-demo-suite.ps1 -Tenant 6bs6wq.onmicrosoft.com -Only msaip,hr
      .\scripts\seed-demo-suite.ps1 -Tenant 6bs6wq.onmicrosoft.com -Clear
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Tenant,
    [string[]]$Only = @("msaip", "hr", "tradesecret"),
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

function U([string]$local) { return "$local@$Tenant" }

# --- App-only token ---
Write-Host "Getting app-only token ..." -ForegroundColor Cyan
$tokenBody = @{ client_id = $ClientId; client_secret = $ClientSecret; scope = 'https://graph.microsoft.com/.default'; grant_type = 'client_credentials' }
$tokenResp = Invoke-RestMethod -Method POST -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" -Body $tokenBody -ContentType 'application/x-www-form-urlencoded'
if (-not $tokenResp.access_token) { throw "Token request returned no access_token." }
$Headers = @{ Authorization = "Bearer $($tokenResp.access_token)" }

function Invoke-Graph {
    param([string]$Method, [string]$Path, [object]$Obj)
    $uri = "https://graph.microsoft.com$Path"
    if ($null -ne $Obj) { return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers -Body ($Obj | ConvertTo-Json -Depth 20) -ContentType 'application/json' }
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers
}

# Seed one mailbox with one scenario's records (idempotent by category).
function Seed-Mailbox([string]$Upn, [string]$Category, [array]$Records) {
    $name = ($Upn.Split('@')[0] -replace '\.', ' '); $name = (Get-Culture).TextInfo.ToTitleCase($name)
    Write-Host "  $Upn" -ForegroundColor Cyan
    $user = $null
    try { $user = Invoke-Graph GET "/v1.0/users/$Upn`?`$select=id,displayName" } catch { Write-Host "    SKIP (no mailbox: $($_.Exception.Message))" -ForegroundColor Yellow; return 0 }
    $userId = $user.id

    $inbox = Invoke-Graph GET "/v1.0/users/$userId/mailFolders/inbox/messages`?`$top=150&`$select=id,categories"
    $removed = 0
    foreach ($m in @($inbox.value)) { if ($m.categories -and ($m.categories -contains $Category)) { Invoke-Graph DELETE "/v1.0/users/$userId/messages/$($m.id)" | Out-Null; $removed++ } }
    if ($Clear) { Write-Host "    cleared $removed" -ForegroundColor Green; return 0 }
    if ($removed -gt 0) { Write-Host "    removed $removed previously-seeded" -ForegroundColor DarkGray }

    $now = Get-Date; $i = 0
    foreach ($r in $Records) {
        $i++
        $received = $now.AddHours(-2 * $i).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        $msg = @{
            subject = $r.subj; body = @{ contentType = "HTML"; content = "<p>$($r.body)</p>" }
            from = @{ emailAddress = @{ address = $r.from; name = $r.fname } }
            sender = @{ emailAddress = @{ address = $r.from; name = $r.fname } }
            toRecipients = @(@{ emailAddress = @{ address = $Upn; name = $name } })
            receivedDateTime = $received; sentDateTime = $received; isRead = $false; categories = @($Category)
        }
        Invoke-Graph POST "/v1.0/users/$userId/mailFolders/inbox/messages" $msg | Out-Null
        Write-Host ("    [{0,-10}] {1}" -f $r.cat, $r.subj) -ForegroundColor DarkGray
    }
    Write-Host "    seeded $($Records.Count)" -ForegroundColor Green
    return $Records.Count
}

$PII = @{ cat = "PII"; from = "hr@aegisdemo.example"; fname = "HR Operations"; subj = "Your updated contact record on file"; body = "We updated your personal contact record: home address 4821 Maple Court, Springfield, and mobile phone 415-555-0182. Please confirm." }
$NOISE = @(
    @{ cat = "NOISE"; from = "events@aegisdemo.example"; fname = "Company Events"; subj = "All-hands reminder - Friday 10:00"; body = "Company all-hands is Friday at 10:00 in the main hall and on Teams. No action needed." }
    @{ cat = "NOISE"; from = "it-ops@aegisdemo.example"; fname = "IT Operations"; subj = "Nightly backup completed - cluster 7"; body = "Nightly backup completed successfully. 4.2 TB across 118 databases." }
    @{ cat = "NOISE"; from = "facilities@aegisdemo.example"; fname = "Facilities"; subj = "Lunch menu - week of the 14th"; body = "This week's cafeteria menu is attached. Taco Tuesday returns." }
)

# ================= Scenario content =================
$Suite = @{
    msaip = @{
        label = "MSA / IP dispute (Snowflake MSA, vendorx section 8.2)"; category = "AEGIS-DEMO-MSAIP"
        mailboxes = @(
            @{ upn = U "priya.kulkarni"; records = @(
                @{ cat = "RESPONSIVE"; from = "procurement@aegisdemo.example"; fname = "Procurement"; subj = "Snowflake MSA renewal - vendorx pricing (Net 30 vs Net 45)"; body = "The Snowflake MSA renewal is stuck on payment terms; vendorx proposed Net 30, we want Net 45. Redlined pricing attached." }
                @{ cat = "RESPONSIVE"; from = "vendor-mgmt@aegisdemo.example"; fname = "Vendor Mgmt"; subj = "vendorx negotiation - counterparty proposal summary"; body = "Proposal: 12-month term, auto-renew, Net 30, broad IP assignment. Recommend pushing back on Net 30 and narrowing section 8.2." }
                @{ cat = "RESPONSIVE"; from = "finance@aegisdemo.example"; fname = "Finance"; subj = "Invoice dispute - vendorx Q1 usage overage"; body = "vendorx Q1 invoice has an unapproved usage overage. Do not pay until pricing is re-papered in the renewal." }
                @{ cat = "PRIVILEGED"; from = "gc@aegisdemo.example"; fname = "Office of the GC"; subj = "Privileged - litigation risk if we miss the renewal window"; body = "PRIVILEGED AND CONFIDENTIAL - prepared at the request of counsel. Exposure if vendorx alleges breach, plus negotiating posture. Do not forward." }
                $PII ) + $NOISE }
            @{ upn = U "marcus.reid"; records = @(
                @{ cat = "PRIVILEGED"; from = "outside.counsel@wilsonpartners.example"; fname = "Wilson Partners LLP"; subj = "PRIVILEGED AND CONFIDENTIAL - Attorney-Client - section 8.2 IP position"; body = "ATTORNEY-CLIENT PRIVILEGED AND CONFIDENTIAL. ATTORNEY WORK PRODUCT. Section 8.2 as drafted likely transfers jointly-developed model weights to vendorx. Do not share outside legal." }
                @{ cat = "PRIVILEGED"; from = "outside.counsel@wilsonpartners.example"; fname = "Wilson Partners LLP"; subj = "Privileged work product - litigation risk assessment (vendorx)"; body = "PRIVILEGED - litigation exposure assessment and recommended posture for the Snowflake MSA renewal. Legal advice - do not forward." }
                @{ cat = "RESPONSIVE"; from = "procurement@aegisdemo.example"; fname = "Procurement"; subj = "RE: Snowflake MSA redlines - section 8.2"; body = "Latest redlines attached; legal to confirm IP assignment language before we return to vendorx." }
                @{ cat = "RESPONSIVE"; from = "vendor-mgmt@aegisdemo.example"; fname = "Vendor Mgmt"; subj = "vendorx counterproposal - legal review needed"; body = "Counterproposal flags section 8.2 for legal review before the negotiation call." }
                $PII ) + $NOISE }
            @{ upn = U "rebecca.sato"; records = @(
                @{ cat = "RESPONSIVE"; from = "eng-lead@aegisdemo.example"; fname = "Eng Lead"; subj = "Snowflake pipeline dependency - section 8.2 review"; body = "Three production pipelines depend on the Snowflake contract; prioritize the section 8.2 review before renewal." }
                @{ cat = "RESPONSIVE"; from = U "rebecca.sato"; fname = "Rebecca Sato"; subj = "Model weights ownership under section 8.2"; body = "Section 8.2 is ambiguous on jointly-developed model weights; if vendorx claims the fine-tuned models we have a problem. Looping in legal." }
                @{ cat = "RESPONSIVE"; from = "architect@aegisdemo.example"; fname = "Principal Architect"; subj = "RE: data migration plan before MSA renewal"; body = "Migration runbook for the Snowflake integration incl. the derived-model export path section 8.2 covers." }
                $PII ) + $NOISE }
            @{ upn = U "samira.iqbal"; records = @(
                @{ cat = "RESPONSIVE"; from = U "samira.iqbal"; fname = "Samira Iqbal"; subj = "Architecture doc - Snowflake integration (section 8.2 scope)"; body = "Integration architecture doc referenced in the MSA; documents which jointly-developed components section 8.2 would assign to vendorx." }
                @{ cat = "RESPONSIVE"; from = "finance@aegisdemo.example"; fname = "Finance"; subj = "vendorx usage overage - Q1 metrics attached"; body = "Raw platform metrics behind the vendorx overage dispute for engineering to validate before the negotiation." }
                @{ cat = "PRIVILEGED"; from = "gc@aegisdemo.example"; fname = "Office of the GC"; subj = "Privileged - forwarding counsel note on IP scope"; body = "PRIVILEGED AND CONFIDENTIAL - forwarding outside counsel's advice on the section 8.2 IP scope. Engineering leadership only." }
                $PII ) + $NOISE }
            @{ upn = U "carlos.mendez"; records = @(
                @{ cat = "RESPONSIVE"; from = "ap@aegisdemo.example"; fname = "Accounts Payable"; subj = "vendorx invoice dispute - Q1 overage"; body = "vendorx Q1 invoice includes an unapproved usage overage under the current MSA. Hold payment pending re-paper." }
                @{ cat = "RESPONSIVE"; from = "procurement@aegisdemo.example"; fname = "Procurement"; subj = "Snowflake committed-use discount at risk"; body = "If renewal slips past the deadline we lose the committed-use discount - a six-figure swing." }
                @{ cat = "PRIVILEGED"; from = "gc@aegisdemo.example"; fname = "Office of the GC"; subj = "Privileged - counsel's note on payment-term risk"; body = "PRIVILEGED AND CONFIDENTIAL - outside counsel's advice on payment-term risk. Finance leadership only - do not distribute." }
                $PII ) + $NOISE }
        )
    }
    hr = @{
        label = "HR internal investigation (workplace-conduct complaint HR-2026-014)"; category = "AEGIS-DEMO-HR"
        mailboxes = @(
            @{ upn = U "daniel.brooks"; records = @(
                @{ cat = "RESPONSIVE"; from = "ethics-line@aegisdemo.example"; fname = "Ethics Line"; subj = "CONFIDENTIAL - conduct complaint intake (Case HR-2026-014)"; body = "A workplace-conduct complaint was filed against a sales manager. Summary of the allegation and the reporting employee's account attached." }
                @{ cat = "RESPONSIVE"; from = U "daniel.brooks"; fname = "Daniel Brooks"; subj = "Witness interview schedule - HR-2026-014"; body = "Proposed interview schedule for the three witnesses and the respondent. Please confirm availability." }
                @{ cat = "PRIVILEGED"; from = "lena.perez@$Tenant"; fname = "Lena Perez (Legal)"; subj = "PRIVILEGED - legal guidance on HR-2026-014"; body = "ATTORNEY-CLIENT PRIVILEGED AND CONFIDENTIAL. Legal guidance on conducting the investigation, interview scope, and retaliation risk. Do not share outside HR/Legal." }
                @{ cat = "PII"; from = "hris@aegisdemo.example"; fname = "HRIS"; subj = "Complainant and witness contact list"; body = "Contact details for the parties: names, personal mobiles (415-555-0144, 415-555-0177) and home addresses. Handle as confidential." }
                @{ cat = "RESPONSIVE"; from = "policy@aegisdemo.example"; fname = "People Policy"; subj = "Anti-harassment and retaliation policy (current)"; body = "The current policy referenced in the investigation, for the case file." }
                ) + $NOISE }
            @{ upn = U "lena.perez"; records = @(
                @{ cat = "PRIVILEGED"; from = U "lena.perez"; fname = "Lena Perez"; subj = "PRIVILEGED AND CONFIDENTIAL - conduct investigation legal assessment"; body = "ATTORNEY WORK PRODUCT. Preliminary legal assessment of HR-2026-014 including credibility factors and exposure. Privileged - do not forward." }
                @{ cat = "PRIVILEGED"; from = U "lena.perez"; fname = "Lena Perez"; subj = "Privileged - recommended remediation and litigation risk"; body = "PRIVILEGED. Recommended remediation options and litigation risk if the respondent is terminated. Legal advice." }
                @{ cat = "RESPONSIVE"; from = U "daniel.brooks"; fname = "Daniel Brooks"; subj = "RE: interview notes - need legal review"; body = "Attaching the witness interview notes; please review before we finalize findings." }
                $PII ) + $NOISE }
            @{ upn = U "alex.kim"; records = @(
                @{ cat = "RESPONSIVE"; from = "team@aegisdemo.example"; fname = "Sales Team"; subj = "RE: offsite feedback - flagged conduct"; body = "Thread referencing the offsite incident that prompted the complaint. Forwarded for the record." }
                @{ cat = "RESPONSIVE"; from = "hr@aegisdemo.example"; fname = "HR Operations"; subj = "Notice of investigation - please preserve communications"; body = "You are asked to preserve all communications relevant to the matter under review. Do not delete messages." }
                $PII ) + $NOISE }
        )
    }
    tradesecret = @{
        label = "Trade-secret / departing employee (exfiltration)"; category = "AEGIS-DEMO-TRADESECRET"
        mailboxes = @(
            @{ upn = U "sarah.watson"; records = @(
                @{ cat = "RESPONSIVE"; from = U "sarah.watson"; fname = "Sarah Watson"; subj = "Fwd: architecture docs and model weights"; body = "HOT: forwarding the core architecture docs and model-weight export to my personal address sarah.watson.personal@gmail.example before my last day." }
                @{ cat = "RESPONSIVE"; from = "storage-alerts@aegisdemo.example"; fname = "Storage Alerts"; subj = "Large export completed - full dataset (18 GB)"; body = "A full dataset export (18 GB) was downloaded from your account. This message is evidence of the pre-departure download." }
                @{ cat = "RESPONSIVE"; from = "eng-lead@aegisdemo.example"; fname = "Eng Lead"; subj = "Handover - repo access and model weights"; body = "Please document repo access and where the trained model weights live before your last day." }
                @{ cat = "NOISE"; from = "hr@aegisdemo.example"; fname = "HR Operations"; subj = "Offboarding checklist"; body = "Complete the standard offboarding checklist before your last day." }
                ) }
            @{ upn = U "samira.iqbal"; records = @(
                @{ cat = "RESPONSIVE"; from = U "samira.iqbal"; fname = "Samira Iqbal"; subj = "Suspicious activity - large downloads by departing engineer"; body = "Flagging unusual large downloads and a forward to a personal gmail by a departing engineer. Recommend we preserve the mailbox and OneDrive now." }
                @{ cat = "RESPONSIVE"; from = "security@aegisdemo.example"; fname = "Security"; subj = "RE: preserve Sarah's mailbox and OneDrive"; body = "Preservation initiated. Attaching the access + download logs for the investigation timeline." }
                @{ cat = "PRIVILEGED"; from = "thomas.berger@$Tenant"; fname = "Thomas Berger (Legal)"; subj = "Privileged - counsel note on trade-secret claim"; body = "ATTORNEY-CLIENT PRIVILEGED. Preliminary view on the trade-secret misappropriation claim and preservation obligations. Do not forward." }
                ) + $NOISE }
            @{ upn = U "thomas.berger"; records = @(
                @{ cat = "PRIVILEGED"; from = U "thomas.berger"; fname = "Thomas Berger"; subj = "PRIVILEGED - trade-secret misappropriation assessment"; body = "ATTORNEY WORK PRODUCT. Assessment of the misappropriation claim against the departing engineer and the strength of the exfiltration evidence. Privileged." }
                @{ cat = "PRIVILEGED"; from = U "thomas.berger"; fname = "Thomas Berger"; subj = "Privileged - draft cease-and-desist to competitor"; body = "PRIVILEGED AND CONFIDENTIAL - draft cease-and-desist to the competitor who hired the engineer. Legal review only." }
                @{ cat = "RESPONSIVE"; from = "security@aegisdemo.example"; fname = "Security"; subj = "RE: evidence of exfiltration - timeline"; body = "Consolidated timeline of downloads, the personal-gmail forward, and USB activity for the case file." }
                $PII ) + $NOISE }
        )
    }
}

# ================= Run =================
$grand = 0
foreach ($key in $Only) {
    $sc = $Suite[$key]
    if (-not $sc) { Write-Host "Unknown scenario '$key' (valid: msaip, hr, tradesecret)" -ForegroundColor Yellow; continue }
    Write-Host ""
    Write-Host "### $($sc.label)  [$($sc.category)]" -ForegroundColor Magenta
    foreach ($mb in $sc.mailboxes) { $grand += (Seed-Mailbox $mb.upn $sc.category $mb.records) }
}

Write-Host ""
if ($Clear) { Write-Host "Done (clear only)." -ForegroundColor Green; return }
Write-Host "Seeded $grand messages across the demo suite." -ForegroundColor Green
Write-Host "Legal hold / culling / AI review: create or open a hold, add these custodians, Collection -> Preview -> Commit -> Run AI review." -ForegroundColor Green
Write-Host "DSAR: seed-priya-dsar-mailbox.ps1 seeds the DSAR subject separately." -ForegroundColor Green
