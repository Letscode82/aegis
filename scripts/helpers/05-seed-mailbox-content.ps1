#!/usr/bin/env pwsh
<#
    05-seed-mailbox-content.ps1 — Send the realistic email threads
    described in each matter manifest.

    Auth model — read carefully
    ───────────────────────────
    Sending mail AS another user via Graph requires APPLICATION
    permissions. Delegated Global Admin is rejected by the Graph
    permission model — Send-MgUserMail under a delegated token
    returns 403 even with Mail.Send and Mail.ReadWrite granted to
    the signed-in admin. This is not a missing scope; it's the
    permission model itself.

    Therefore: this helper authenticates app-only via
    Get-AegisM365AppOnlyToken (client credentials flow against
    the AEGIS app registration) and POSTs directly to
    /v1.0/users/{senderId}/sendMail. Connect-AegisM365Graph in
    01-connect.ps1 (delegated) is unaffected and still owns
    directory ops.

    Idempotency: every email has a stable id. Sent ids are
    recorded in the seed state file. Re-runs skip already-sent ids.

    State remediation: the previous (delegated-auth) implementation
    printed "✓ sent" even on 403 because Send-MgUserMail wrote
    non-terminating errors. State files from those runs may
    contain sentEmails entries for emails that never arrived.
    On first run after this PR, Reset-LegacySentEmailsStateIfNeeded
    clears the bucket and stamps stateSchemaVersion = 2 — every
    email re-sends, then idempotency resumes normally.

    Sarah Watson note: with app-only sendMail, disabled accounts
    can also send. The previous disabled-sender import-into-inbox
    fallback is gone.
#>

. (Join-Path $PSScriptRoot '_lib.ps1')
. (Join-Path $PSScriptRoot '_app-only-auth.ps1')

# ───────────────────────────────────────────────────────────────────
# Constants
# ───────────────────────────────────────────────────────────────────

$Script:SentEmailsStateSchemaVersion = 2

# ───────────────────────────────────────────────────────────────────
# Body helpers (unchanged from prior PR)
# ───────────────────────────────────────────────────────────────────

function Resolve-EmailBody {
    param([Parameter(Mandatory)][string]$TemplateName)
    $path = Join-Path $Script:SeedDataRoot "emails/$TemplateName"
    if (-not (Test-Path $path)) {
        throw "Email body template not found: $TemplateName at $path"
    }
    return (Get-Content -Raw -Path $path)
}

function ConvertTo-HtmlBody {
    param([Parameter(Mandatory)][string]$PlainText)
    $escaped = $PlainText `
        -replace '&', '&amp;' `
        -replace '<', '&lt;' `
        -replace '>', '&gt;' `
        -replace "`r", ''
    $escaped = $escaped -replace "`n", "<br/>`n"
    return "<html><body style=`"font-family:Calibri,Arial,sans-serif;font-size:11pt;`">$escaped</body></html>"
}

# ───────────────────────────────────────────────────────────────────
# State schema migration. One-time clean of legacy sentEmails entries
# that may have been recorded against delegated-auth 403s. Returns
# $true if a reset happened (so the caller can log / surface that to
# the operator), $false if the state was already at v2.
# ───────────────────────────────────────────────────────────────────

function Reset-LegacySentEmailsStateIfNeeded {
    $state = Get-SeedState

    $hasField = $false
    if ($state.PSObject.Properties['stateSchemaVersion']) { $hasField = $true }
    $version = if ($hasField) { [int]$state.stateSchemaVersion } else { 0 }

    if ($version -ge $Script:SentEmailsStateSchemaVersion) { return $false }

    Write-Warn "Clearing legacy sentEmails entries from pre-app-only-auth runs — those sends may not have reached recipients."
    Write-Warn "Affected emails will be re-attempted on this run; idempotency resumes after this one-time reset."

    # Replace sentEmails with an empty PSCustomObject so the JSON shape stays stable.
    $emptyBucket = [pscustomobject]@{}
    if ($state.PSObject.Properties['sentEmails']) {
        $state.sentEmails = $emptyBucket
    } else {
        $state | Add-Member -NotePropertyName 'sentEmails' -NotePropertyValue $emptyBucket
    }

    if ($hasField) {
        $state.stateSchemaVersion = $Script:SentEmailsStateSchemaVersion
    } else {
        $state | Add-Member -NotePropertyName 'stateSchemaVersion' -NotePropertyValue $Script:SentEmailsStateSchemaVersion
    }

    Save-SeedState $state
    return $true
}

# ───────────────────────────────────────────────────────────────────
# Send via app-only token. Throws on any non-202; the caller leaves
# the state mark un-written so the next run retries. The previous
# helper's "non-terminating error swallowed by ✓ sent" failure mode
# cannot occur here — every code path either returns 202 or throws.
# ───────────────────────────────────────────────────────────────────

function Send-AegisMatterEmail {
    param(
        [Parameter(Mandatory)][string]$SenderId,
        [Parameter(Mandatory)][string]$Subject,
        [Parameter(Mandatory)][string]$HtmlBody,
        [Parameter(Mandatory)][object[]]$ToRecipients,
        [object[]]$CcRecipients,
        [string]$Importance
    )

    $message = @{
        subject      = $Subject
        body         = @{ contentType = 'HTML'; content = $HtmlBody }
        toRecipients = $ToRecipients
    }
    if ($CcRecipients -and $CcRecipients.Count -gt 0) {
        $message.ccRecipients = $CcRecipients
    }
    if ($Importance) {
        $message.importance = $Importance
    }

    Invoke-AegisM365SendMailAppOnly `
        -SenderId $SenderId `
        -Message $message `
        -SaveToSentItems $true
}

# ───────────────────────────────────────────────────────────────────
# Orchestrator
# ───────────────────────────────────────────────────────────────────

function Invoke-SeedMailboxContent {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $UserMap,
        [switch]$VerifyOnly
    )

    Write-Step "Seeding mailbox content"

    if (-not $VerifyOnly) {
        # Force a token fetch up front so the operator sees the
        # AEGIS_M365_CLIENT_SECRET error (if any) before iterating
        # over matters, and so the verification-harness "fetched once"
        # assertion has a deterministic anchor.
        [void](Get-AegisM365AppOnlyToken)

        # One-time legacy-state cleanup. No-op once stateSchemaVersion
        # is 2; runs verbosely on the first post-merge invocation.
        [void](Reset-LegacySentEmailsStateIfNeeded)
    }

    $matterFiles = Get-ChildItem -Path (Join-Path $Script:SeedDataRoot 'matters') -Filter '*.json'

    foreach ($matterFile in $matterFiles) {
        $matter = Get-Content -Raw -Path $matterFile.FullName | ConvertFrom-Json -Depth 32

        Write-Host ""
        Write-Host "  Matter: $($matter.matterId)" -ForegroundColor White

        foreach ($email in $matter.emails) {
            $stateKey = "$($matter.matterId):$($email.id)"
            $alreadySent = Get-SeedStateMark -Bucket 'sentEmails' -Key $stateKey

            if ($VerifyOnly) {
                if ($alreadySent) {
                    Write-Ok "    $($email.id) — sent"
                } else {
                    Write-Warn "    $($email.id) — NOT SENT"
                }
                continue
            }

            if ($alreadySent) {
                Write-Skip "    $($email.id) — already sent"
                continue
            }

            $sender = $UserMap[$email.from]
            if (-not $sender -or -not $sender.id) {
                Write-Warn "    $($email.id) — sender '$($email.from)' not found, skipping"
                continue
            }

            $toRecipients = @()
            foreach ($k in $email.to) {
                $r = $UserMap[$k]
                if ($r -and $r.upn) {
                    $toRecipients += @{ emailAddress = @{ address = $r.upn; name = $r.displayName } }
                }
            }
            $ccRecipients = @()
            foreach ($k in $email.cc) {
                $r = $UserMap[$k]
                if ($r -and $r.upn) {
                    $ccRecipients += @{ emailAddress = @{ address = $r.upn; name = $r.displayName } }
                }
            }
            if ($toRecipients.Count -eq 0) {
                Write-Warn "    $($email.id) — no resolvable recipients, skipping"
                continue
            }

            $bodyText = Resolve-EmailBody -TemplateName $email.bodyTemplate
            $html = ConvertTo-HtmlBody -PlainText $bodyText

            $importance = if ($email.privileged) { 'high' } else { $null }

            try {
                Send-AegisMatterEmail `
                    -SenderId $sender.id `
                    -Subject $email.subject `
                    -HtmlBody $html `
                    -ToRecipients $toRecipients `
                    -CcRecipients $ccRecipients `
                    -Importance $importance

                Set-SeedStateMark -Bucket 'sentEmails' -Key $stateKey -Value @{
                    sentAt   = (Get-Date).ToString('o')
                    matterId = $matter.matterId
                    emailId  = $email.id
                }
                Write-Ok "    $($email.id) — sent"
            } catch {
                Write-Fail `
                    "Email send failed: $($email.id) (matter $($matter.matterId))." `
                    ("Error: $($_.Exception.Message)`n" +
                     "Common causes:`n" +
                     "  • Mailbox not yet provisioned — license-propagation latency can be 10-15 min.`n" +
                     "  • App registration is missing the required Application permissions:`n" +
                     "      Mail.Send, Mail.ReadWrite (admin-consented).`n" +
                     "  • AEGIS_M365_CLIENT_SECRET expired or rotated.`n" +
                     "Re-run the orchestrator to retry; idempotency will skip what's already sent.")
                throw
            }
        }
    }

    Write-Ok "Mailbox content seeding complete."
}
