#!/usr/bin/env pwsh
<#
    Shared utilities for the AEGIS M365 tenant seed.

    All helpers source this file at the top so logging, idempotency
    state, and JSON loading work consistently. Must remain side-effect
    free — sourcing this file should not perform any tenant operations.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ───────────────────────────────────────────────────────────────────
# Paths
# ───────────────────────────────────────────────────────────────────

$Script:ScriptsRoot = Split-Path -Parent $PSScriptRoot
$Script:SeedDataRoot = Join-Path $Script:ScriptsRoot 'seed-data'
$Script:StateFile = Join-Path $Script:ScriptsRoot '.seed-state.json'

# ───────────────────────────────────────────────────────────────────
# Logging
# ───────────────────────────────────────────────────────────────────

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "▶ $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "  ✓ $Message" -ForegroundColor Green
}

function Write-Skip {
    param([string]$Message)
    Write-Host "  · $Message" -ForegroundColor DarkGray
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  ⚠ $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message, [string]$Remediation)
    Write-Host ""
    Write-Host "✗ $Message" -ForegroundColor Red
    if ($Remediation) {
        Write-Host ""
        Write-Host "  Remediation:" -ForegroundColor Yellow
        foreach ($line in ($Remediation -split "`n")) {
            Write-Host "    $line" -ForegroundColor Yellow
        }
    }
    Write-Host ""
}

# ───────────────────────────────────────────────────────────────────
# JSON loading / state file
# ───────────────────────────────────────────────────────────────────

function Get-SeedJson {
    param([Parameter(Mandatory)][string]$RelativePath)
    $full = Join-Path $Script:SeedDataRoot $RelativePath
    if (-not (Test-Path $full)) {
        throw "Seed data file not found: $full"
    }
    return (Get-Content -Raw -Path $full | ConvertFrom-Json -Depth 32)
}

function Get-SeedState {
    if (-not (Test-Path $Script:StateFile)) {
        return [pscustomobject]@{
            tenant     = $null
            startedAt  = $null
            completed  = @{}
            sentEmails = @{}
        }
    }
    return (Get-Content -Raw -Path $Script:StateFile | ConvertFrom-Json -Depth 32)
}

function Save-SeedState {
    param([Parameter(Mandatory)]$State)
    $State | ConvertTo-Json -Depth 32 | Set-Content -Path $Script:StateFile -Encoding UTF8
}

function Set-SeedStateMark {
    param(
        [Parameter(Mandatory)][string]$Bucket,
        [Parameter(Mandatory)][string]$Key,
        [Parameter(Mandatory)]$Value
    )
    $state = Get-SeedState
    if (-not $state.PSObject.Properties[$Bucket]) {
        $state | Add-Member -NotePropertyName $Bucket -NotePropertyValue (@{})
    }
    $bucketObj = $state.$Bucket
    if ($bucketObj -is [System.Collections.IDictionary]) {
        $bucketObj[$Key] = $Value
    } else {
        # PSCustomObject from previous JSON deserialization
        if ($bucketObj.PSObject.Properties[$Key]) {
            $bucketObj.$Key = $Value
        } else {
            $bucketObj | Add-Member -NotePropertyName $Key -NotePropertyValue $Value
        }
    }
    Save-SeedState $state
}

function Get-SeedStateMark {
    param(
        [Parameter(Mandatory)][string]$Bucket,
        [Parameter(Mandatory)][string]$Key
    )
    $state = Get-SeedState
    if (-not $state.PSObject.Properties[$Bucket]) { return $null }
    $bucketObj = $state.$Bucket
    if (-not $bucketObj) { return $null }
    if ($bucketObj.PSObject.Properties[$Key]) {
        return $bucketObj.$Key
    }
    return $null
}

# ───────────────────────────────────────────────────────────────────
# Tenant resolution + UPN substitution
# ───────────────────────────────────────────────────────────────────

function Resolve-Tenant {
    if (-not $env:M365_TENANT) {
        throw "M365_TENANT environment variable is required (e.g. 6bs6wq.onmicrosoft.com)."
    }
    return $env:M365_TENANT.Trim()
}

function Resolve-UPN {
    param(
        [Parameter(Mandatory)][string]$LocalPart,
        [string]$Tenant = $(Resolve-Tenant)
    )
    return "$LocalPart@$Tenant"
}

# ───────────────────────────────────────────────────────────────────
# User key → UPN resolution (for sites.json members, matter manifests)
# ───────────────────────────────────────────────────────────────────

function Get-UserMap {
    $users = (Get-SeedJson 'users.json').users
    $tenant = Resolve-Tenant
    $map = @{}
    foreach ($u in $users) {
        $map[$u.key] = [pscustomobject]@{
            key         = $u.key
            upn         = "$($u.upnLocalPart)@$tenant"
            displayName = $u.displayName
            spec        = $u
        }
    }
    return $map
}

# ───────────────────────────────────────────────────────────────────
# Random secure password generator (used for initial sign-in only)
# ───────────────────────────────────────────────────────────────────

function New-SecurePassword {
    param([int]$Length = 16)
    # Mix of upper/lower/digits/symbols. ASCII to avoid Entra complexity surprises.
    $upper = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZ'
    $lower = [char[]]'abcdefghijkmnopqrstuvwxyz'
    $digit = [char[]]'23456789'
    $sym   = [char[]]'!@#$%^&*()-_=+'
    $all   = $upper + $lower + $digit + $sym

    $bytes = [byte[]]::new($Length)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)

    $chars = New-Object System.Text.StringBuilder
    # Guarantee at least one of each class
    [void]$chars.Append($upper[$bytes[0] % $upper.Length])
    [void]$chars.Append($lower[$bytes[1] % $lower.Length])
    [void]$chars.Append($digit[$bytes[2] % $digit.Length])
    [void]$chars.Append($sym[$bytes[3] % $sym.Length])
    for ($i = 4; $i -lt $Length; $i++) {
        [void]$chars.Append($all[$bytes[$i] % $all.Length])
    }
    return $chars.ToString()
}

# ───────────────────────────────────────────────────────────────────
# Polling helper — returns when predicate is true or throws on timeout
# ───────────────────────────────────────────────────────────────────

function Wait-For {
    param(
        [Parameter(Mandatory)][string]$Description,
        [Parameter(Mandatory)][scriptblock]$Predicate,
        [int]$TimeoutSeconds = 600,
        [int]$IntervalSeconds = 10
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $attempt = 0
    while ((Get-Date) -lt $deadline) {
        $attempt++
        try {
            if (& $Predicate) {
                Write-Ok "$Description (after $attempt poll(s))"
                return
            }
        } catch {
            # Predicate failures are expected during provisioning — keep polling.
        }
        Start-Sleep -Seconds $IntervalSeconds
    }
    throw "Timeout waiting for: $Description (after $TimeoutSeconds seconds)."
}
