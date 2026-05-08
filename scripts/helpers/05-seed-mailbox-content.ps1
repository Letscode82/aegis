#!/usr/bin/env pwsh
<#
    05-seed-mailbox-content.ps1 — Send the realistic email threads
    described in each matter manifest using Send-MgUserMail.

    Idempotency: every email has a stable id. Sent ids are recorded in
    the seed state file. Re-runs skip already-sent ids.

    Sender quirk: Sarah Watson's account is disabled, so she can't
    send via Send-MgUserMail. The single email "from" Sarah
    (watson-routine-05) is delivered by importing it into Daniel's
    mailbox as a received message via the messages endpoint instead.
    AEGIS auto-discovery still picks it up as content related to the
    employment matter.
#>

. (Join-Path $PSScriptRoot '_lib.ps1')

Import-Module Microsoft.Graph.Users.Actions -ErrorAction Stop
Import-Module Microsoft.Graph.Mail -ErrorAction Stop

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
    # Wrap in monospace-friendly HTML so Outlook preserves layout.
    $escaped = $PlainText `
        -replace '&', '&amp;' `
        -replace '<', '&lt;' `
        -replace '>', '&gt;' `
        -replace "`r", ''
    $escaped = $escaped -replace "`n", "<br/>`n"
    return "<html><body style=`"font-family:Calibri,Arial,sans-serif;font-size:11pt;`">$escaped</body></html>"
}

function Invoke-SeedMailboxContent {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $UserMap,
        [switch]$VerifyOnly
    )

    Write-Step "Seeding mailbox content"

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
                    $toRecipients += @{ EmailAddress = @{ Address = $r.upn; Name = $r.displayName } }
                }
            }
            $ccRecipients = @()
            foreach ($k in $email.cc) {
                $r = $UserMap[$k]
                if ($r -and $r.upn) {
                    $ccRecipients += @{ EmailAddress = @{ Address = $r.upn; Name = $r.displayName } }
                }
            }
            if ($toRecipients.Count -eq 0) {
                Write-Warn "    $($email.id) — no resolvable recipients, skipping"
                continue
            }

            $bodyText = Resolve-EmailBody -TemplateName $email.bodyTemplate
            $html = ConvertTo-HtmlBody -PlainText $bodyText

            $messagePart = @{
                Subject      = $email.subject
                Body         = @{ ContentType = 'HTML'; Content = $html }
                ToRecipients = $toRecipients
            }
            if ($ccRecipients.Count -gt 0) { $messagePart.CcRecipients = $ccRecipients }
            if ($email.privileged) {
                $messagePart.Importance = 'high'
            }

            # Sender path branch — disabled accounts can't Send. Use messages-add for those.
            $isSenderDisabled = (Get-MgUser -UserId $sender.id -Property 'accountEnabled').AccountEnabled -eq $false
            try {
                if ($isSenderDisabled) {
                    # Drop the message into the first recipient's inbox via /messages with internetMessageHeaders
                    # so it appears as a received message authored by the disabled user.
                    foreach ($recipient in @($email.to + $email.cc)) {
                        $r = $UserMap[$recipient]
                        if (-not $r -or -not $r.id) { continue }
                        $importPayload = @{
                            Subject               = $email.subject
                            Body                  = @{ ContentType = 'HTML'; Content = $html }
                            From                  = @{ EmailAddress = @{ Address = $sender.upn; Name = $sender.displayName } }
                            Sender                = @{ EmailAddress = @{ Address = $sender.upn; Name = $sender.displayName } }
                            ToRecipients          = $toRecipients
                            CcRecipients          = $ccRecipients
                            ReceivedDateTime      = $email.sentAt
                            SentDateTime          = $email.sentAt
                            IsRead                = $false
                            InternetMessageHeaders = @(
                                @{ Name = 'X-AEGIS-Seed'; Value = $email.id }
                            )
                        }
                        Invoke-MgGraphRequest -Method POST `
                            -Uri "/v1.0/users/$($r.id)/mailFolders/inbox/messages" `
                            -Body ($importPayload | ConvertTo-Json -Depth 16) | Out-Null
                    }
                    Write-Ok "    $($email.id) — imported (disabled-sender path)"
                } else {
                    $sendBody = @{
                        Message         = $messagePart
                        SaveToSentItems = $true
                    }
                    Send-MgUserMail -UserId $sender.id -BodyParameter $sendBody | Out-Null
                    Write-Ok "    $($email.id) — sent"
                }
                Set-SeedStateMark -Bucket 'sentEmails' -Key $stateKey -Value @{
                    sentAt   = (Get-Date).ToString('o')
                    matterId = $matter.matterId
                    emailId  = $email.id
                }
            } catch {
                Write-Fail `
                    "Email send failed: $($email.id) (matter $($matter.matterId))." `
                    ("Error: $($_.Exception.Message)`n" +
                     "Common cause: mailbox not yet provisioned. License-propagation latency can be 10-15 min.`n" +
                     "Re-run the orchestrator to retry; idempotency will skip what's already sent.")
                throw
            }
        }
    }

    Write-Ok "Mailbox content seeding complete."
}
