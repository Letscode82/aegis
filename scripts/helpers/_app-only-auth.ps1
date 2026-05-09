#!/usr/bin/env pwsh
<#
    _app-only-auth.ps1 — Client-credentials (app-only) OAuth2 token
    acquisition for cross-user mailbox + drive operations that
    delegated Global Admin cannot perform.

    Why this exists
    ───────────────
    Microsoft Graph's permission model refuses delegated admin
    tokens for sendMail-as-another-user, mailFolder writes against
    another user's mailbox, and OneDrive uploads into another
    user's drive — even with Mail.Send / Mail.ReadWrite /
    Files.ReadWrite.All granted to the signed-in admin.
    Application permissions are the only path. Delegated auth
    (Connect-AegisM365Graph in 01-connect.ps1) still owns
    directory ops, license assignment, and group / SharePoint
    management.

    The AEGIS app registration's client secret is held in env var
    AEGIS_M365_CLIENT_SECRET. This file fails loud if unset.

    Test seam
    ─────────
    Two script-scope script blocks (AegisAppOnlyTokenInvoker and
    AegisAppOnlyGraphInvoker) wrap every outbound HTTP call.
    Tests overwrite them to drive the auth flow without touching
    Microsoft. Production callers leave them at their defaults.
#>

Set-StrictMode -Version Latest

# ───────────────────────────────────────────────────────────────────
# Application identity
#
# Hard-coded defaults match the AEGIS dev tenant; env-var overrides
# exist so CI / a future second tenant can rebind without an edit.
# Mirrors the pattern used by Resolve-Tenant in _lib.ps1.
# ───────────────────────────────────────────────────────────────────

$Script:AegisAppOnlyTenantId = if ($env:AEGIS_M365_APP_TENANT_ID) {
    $env:AEGIS_M365_APP_TENANT_ID
} else {
    '7972db8d-a6a7-4a54-ae82-ca5f8652fb3d'
}
$Script:AegisAppOnlyClientId = if ($env:AEGIS_M365_APP_CLIENT_ID) {
    $env:AEGIS_M365_APP_CLIENT_ID
} else {
    '94414388-9a8d-43a1-bd65-094798622f7d'
}

# ───────────────────────────────────────────────────────────────────
# Test seams. Real implementations call out to Microsoft.
# ───────────────────────────────────────────────────────────────────

$Script:AegisAppOnlyTokenInvoker = {
    param($Uri, $FormBody)
    Invoke-RestMethod `
        -Method POST `
        -Uri $Uri `
        -ContentType 'application/x-www-form-urlencoded' `
        -Body $FormBody
}

$Script:AegisAppOnlyGraphInvoker = {
    param($Method, $Uri, $Headers, $JsonBody)
    if ($null -ne $JsonBody) {
        Invoke-WebRequest `
            -Method $Method `
            -Uri $Uri `
            -Headers $Headers `
            -ContentType 'application/json' `
            -Body $JsonBody `
            -UseBasicParsing
    } else {
        Invoke-WebRequest `
            -Method $Method `
            -Uri $Uri `
            -Headers $Headers `
            -UseBasicParsing
    }
}

# ───────────────────────────────────────────────────────────────────
# Cached token state.
#
# AccessToken : raw bearer string
# ExpiresAt   : [datetime] absolute expiry (Get-Date + expires_in s)
# ───────────────────────────────────────────────────────────────────

$Script:AegisAppOnlyToken = $null

function Get-AegisM365AppOnlyToken {
    [CmdletBinding()]
    param([switch]$ForceRefresh)

    $expiringSoon = $false
    if ($Script:AegisAppOnlyToken) {
        $remaining = $Script:AegisAppOnlyToken.ExpiresAt - (Get-Date)
        if ($remaining.TotalMinutes -lt 5) { $expiringSoon = $true }
    }

    if (-not $ForceRefresh -and $Script:AegisAppOnlyToken -and -not $expiringSoon) {
        return $Script:AegisAppOnlyToken.AccessToken
    }

    $secret = $env:AEGIS_M365_CLIENT_SECRET
    if (-not $secret) {
        throw (
            "AEGIS_M365_CLIENT_SECRET environment variable is not set.`n" +
            "App-only auth is required for cross-user mailbox / drive operations.`n" +
            "(Helper 05 sendMail-as-another-user; helpers 06/07 cross-user drive uploads.)`n" +
            "Set it (User scope) to the AEGIS app registration's client secret value.`n" +
            "See scripts/README.md for the operator setup steps."
        )
    }

    $tenantId = $Script:AegisAppOnlyTenantId
    $clientId = $Script:AegisAppOnlyClientId
    $tokenUri = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token"
    $form = @{
        client_id     = $clientId
        client_secret = $secret
        scope         = 'https://graph.microsoft.com/.default'
        grant_type    = 'client_credentials'
    }

    $response = & $Script:AegisAppOnlyTokenInvoker $tokenUri $form
    $hasAccessToken = $false
    if ($response -and $response.PSObject.Properties['access_token']) {
        $hasAccessToken = -not [string]::IsNullOrEmpty([string]$response.access_token)
    }
    if (-not $hasAccessToken) {
        throw "Token endpoint returned no access_token. Response: $($response | ConvertTo-Json -Compress -Depth 6)"
    }

    $expiresIn = if ($response.PSObject.Properties['expires_in']) {
        [int]$response.expires_in
    } else {
        3600
    }

    $Script:AegisAppOnlyToken = [pscustomobject]@{
        AccessToken = [string]$response.access_token
        ExpiresAt   = (Get-Date).AddSeconds($expiresIn)
    }
    return $Script:AegisAppOnlyToken.AccessToken
}

function Clear-AegisM365AppOnlyToken {
    $Script:AegisAppOnlyToken = $null
}

# ───────────────────────────────────────────────────────────────────
# Bearer-token Graph caller. Returns the response object the
# invoker produced (Invoke-WebRequest in production gives
# .StatusCode + .Content). Retries once on 401 with a forced
# token refresh — covers the rare mid-flight rotation case.
# ───────────────────────────────────────────────────────────────────

function Invoke-AegisM365GraphAppOnly {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][ValidateSet('GET', 'POST', 'PATCH', 'PUT', 'DELETE')][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [object]$Body
    )

    $url = if ($Path -match '^https?://') { $Path } else { "https://graph.microsoft.com$Path" }

    $jsonBody = $null
    if ($null -ne $Body) {
        $jsonBody = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 32 }
    }

    $token = Get-AegisM365AppOnlyToken
    $headers = @{ Authorization = "Bearer $token" }

    $attempt = 0
    while ($true) {
        $attempt++
        try {
            return & $Script:AegisAppOnlyGraphInvoker $Method $url $headers $jsonBody
        } catch {
            $statusCode = $null
            try {
                if ($_.Exception -and $_.Exception.Response) {
                    $statusCode = [int]$_.Exception.Response.StatusCode
                }
            } catch {}

            if ($statusCode -eq 401 -and $attempt -lt 2) {
                Clear-AegisM365AppOnlyToken
                $token = Get-AegisM365AppOnlyToken -ForceRefresh
                $headers = @{ Authorization = "Bearer $token" }
                continue
            }
            throw
        }
    }
}

# ───────────────────────────────────────────────────────────────────
# /users/{senderId}/sendMail — assert 202 Accepted.
#
# Send-MgUserMail's behaviour of writing non-terminating errors
# was the silent-success bug this PR exists to kill. Anything
# other than 202 throws here, with the response body included so
# the operator can see exactly what Graph rejected.
# ───────────────────────────────────────────────────────────────────

function Invoke-AegisM365SendMailAppOnly {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$SenderId,
        [Parameter(Mandatory)]$Message,
        [bool]$SaveToSentItems = $true
    )

    $payload = @{
        message         = $Message
        saveToSentItems = $SaveToSentItems
    }

    $response = Invoke-AegisM365GraphAppOnly `
        -Method POST `
        -Path "/v1.0/users/$SenderId/sendMail" `
        -Body $payload

    $status = $null
    if ($response -and $response.PSObject.Properties['StatusCode']) {
        $status = [int]$response.StatusCode
    }

    if ($status -ne 202) {
        $bodyText = $null
        try {
            if ($response -and $response.PSObject.Properties['Content']) { $bodyText = [string]$response.Content }
        } catch {}
        throw "sendMail expected HTTP 202 Accepted but got $status. Response body: $bodyText"
    }
}
