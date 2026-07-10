param(
    [switch]$Force,
    [switch]$SkipLive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$StatePath = Join-Path $RepoRoot ".codex-update-check-state.json"
$UsageUrl = "https://chatgpt.com/backend-api/wham/usage"
$CreditsUrl = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits"

function Write-Info($Message) {
    Write-Host "[codex-check] $Message"
}

function Get-FileSha256($Path) {
    if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

function Find-CodexExecutable {
    $candidates = @()
    if ($env:LOCALAPPDATA) {
        $bin = Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin"
        if (Test-Path -LiteralPath $bin) {
            $candidates += Get-ChildItem -LiteralPath $bin -Filter "codex.exe" -Recurse -File -ErrorAction SilentlyContinue
        }
    }

    $pathCommand = Get-Command "codex.exe" -ErrorAction SilentlyContinue
    if ($pathCommand) {
        $candidates += Get-Item -LiteralPath $pathCommand.Source -ErrorAction SilentlyContinue
    }

    $candidates |
        Where-Object { $_ -and (Test-Path -LiteralPath $_.FullName) } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
}

function Get-CodexFingerprint {
    $exe = Find-CodexExecutable
    if (-not $exe) {
        return [ordered]@{
            found = $false
            path = $null
            lastWriteTimeUtc = $null
            length = $null
            sha256 = $null
            productVersion = $null
        }
    }

    $version = $null
    try {
        $version = (Get-Item -LiteralPath $exe.FullName).VersionInfo.ProductVersion
    } catch {
        $version = $null
    }

    [ordered]@{
        found = $true
        path = $exe.FullName
        lastWriteTimeUtc = $exe.LastWriteTimeUtc.ToString("o")
        length = $exe.Length
        sha256 = Get-FileSha256 $exe.FullName
        productVersion = $version
    }
}

function Read-PreviousState {
    if (-not (Test-Path -LiteralPath $StatePath)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

function ConvertTo-StableJson($Value) {
    return $Value | ConvertTo-Json -Depth 12 -Compress
}

function Run-Step($Name, $WorkingDirectory, $File, [string[]]$Arguments) {
    Write-Info "running $Name"
    Push-Location $WorkingDirectory
    try {
        & $File @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Name failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
    Write-Info "$Name passed"
}

function Get-AuthPath {
    if ($env:CODEX_HOME) {
        return Join-Path $env:CODEX_HOME "auth.json"
    }
    return Join-Path $HOME ".codex\auth.json"
}

function Get-JsonProperty($Object, [string[]]$Names) {
    if (-not $Object) {
        return $null
    }
    foreach ($name in $Names) {
        $property = $Object.PSObject.Properties[$name]
        if ($property) {
            return $property.Value
        }
    }
    return $null
}

function Get-StringProperty($Object, [string[]]$Names) {
    $value = Get-JsonProperty $Object $Names
    if ($value -is [string] -and $value.Length -gt 0) {
        return $value
    }
    return $null
}

function ConvertFrom-Base64Url($Value) {
    $padded = $Value.Replace("-", "+").Replace("_", "/")
    switch ($padded.Length % 4) {
        2 { $padded += "==" }
        3 { $padded += "=" }
        1 { return $null }
    }
    return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($padded))
}

function Get-AccountIdFromJwt($AccessToken) {
    $parts = $AccessToken.Split(".")
    if ($parts.Length -lt 2) {
        return $null
    }
    try {
        $payload = ConvertFrom-Base64Url $parts[1] | ConvertFrom-Json
        return Get-StringProperty $payload @(
            "https://api.openai.com/auth.chatgpt_account_id",
            "chatgpt_account_id"
        )
    } catch {
        return $null
    }
}

function Get-CodexAuth {
    $authPath = Get-AuthPath
    if (-not (Test-Path -LiteralPath $authPath)) {
        throw "Codex auth file was not found. Sign in to Codex Desktop first. Path checked: $authPath"
    }

    $authFile = Get-Item -LiteralPath $authPath
    if (-not $authFile.PSIsContainer -and $authFile.Length -gt 262144) {
        throw "Codex auth file is unexpectedly large."
    }

    $raw = Get-Content -LiteralPath $authPath -Raw
    $value = $raw | ConvertFrom-Json
    $tokens = Get-JsonProperty $value @("tokens")
    if (-not $tokens) {
        $tokens = $value
    }

    $accessToken = Get-StringProperty $tokens @("access_token", "accessToken")
    if (-not $accessToken) {
        throw "Codex auth format changed or the login expired: access token was not found."
    }

    $accountId = Get-StringProperty $tokens @("account_id", "accountId")
    if (-not $accountId) {
        $accountId = Get-AccountIdFromJwt $accessToken
    }

    [ordered]@{
        accessToken = $accessToken
        accountId = $accountId
    }
}

function Test-WindowShape($Window) {
    if (-not $Window) {
        return $false
    }
    $remaining = Get-JsonProperty $Window @(
        "remaining_percent",
        "remainingPercent",
        "remaining_pct",
        "remainingPct",
        "remaining_ratio",
        "remainingRatio",
        "remaining"
    )
    $used = Get-JsonProperty $Window @(
        "used_percent",
        "usedPercent",
        "used_pct",
        "usedPct",
        "used_ratio",
        "usedRatio",
        "utilization",
        "used"
    )
    return ($null -ne $remaining -or $null -ne $used)
}

function Find-Window($RateLimit, [string[]]$Names, [uint64]$ExpectedSeconds) {
    foreach ($name in $Names) {
        $candidate = Get-JsonProperty $RateLimit @($name)
        if (Test-WindowShape $candidate) {
            return $candidate
        }
    }

    foreach ($arrayName in @("windows", "limit_windows", "limitWindows", "limits", "buckets")) {
        $items = Get-JsonProperty $RateLimit @($arrayName)
        if (-not ($items -is [System.Array])) {
            continue
        }
        foreach ($item in $items) {
            if (-not (Test-WindowShape $item)) {
                continue
            }

            $seconds = Get-JsonProperty $item @(
                "limit_window_seconds",
                "limitWindowSeconds",
                "window_seconds",
                "windowSeconds",
                "duration_seconds",
                "durationSeconds",
                "period_seconds",
                "periodSeconds"
            )
            $durationMatches = $false
            if ($null -ne $seconds) {
                $durationMatches = ([Math]::Abs([int64]$seconds - [int64]$ExpectedSeconds) -le 60)
            }

            $label = Get-StringProperty $item @("name", "type", "id", "window", "label")
            $nameMatches = $false
            if ($label) {
                $lower = $label.ToLowerInvariant()
                foreach ($name in $Names) {
                    $needle = $name.ToLowerInvariant()
                    if ($lower -eq $needle -or $lower.Contains($needle)) {
                        $nameMatches = $true
                    }
                }
            }

            if ($durationMatches -or $nameMatches) {
                return $item
            }
        }
    }

    return $null
}

function Invoke-CodexQuotaProbe {
    Write-Info "probing Codex auth and quota endpoints"
    $auth = Get-CodexAuth
    $headers = @{
        Authorization = "Bearer $($auth.accessToken)"
        Accept = "application/json"
        originator = "Codex Desktop"
        "OAI-Product-Sku" = "CODEX"
    }
    if ($auth.accountId) {
        $headers["ChatGPT-Account-Id"] = $auth.accountId
    }

    $usageResponse = Invoke-WebRequest -Uri $UsageUrl -Headers $headers -Method Get -TimeoutSec 20
    $usage = $usageResponse.Content | ConvertFrom-Json
    $rateLimit = Get-JsonProperty $usage @("rate_limit", "rateLimit")
    if (-not $rateLimit) {
        $rateLimit = $usage
    }

    $shortWindow = Find-Window $rateLimit @(
        "primary_window",
        "primaryWindow",
        "short_window",
        "shortWindow",
        "five_hour_window",
        "fiveHourWindow",
        "5h",
        "primary"
    ) 18000
    if (-not $shortWindow) {
        throw "Quota response is missing a recognizable 5h window."
    }

    $weeklyWindow = Find-Window $rateLimit @(
        "secondary_window",
        "secondaryWindow",
        "weekly_window",
        "weeklyWindow",
        "week_window",
        "weekWindow",
        "weekly",
        "secondary"
    ) 604800

    try {
        $creditsResponse = Invoke-WebRequest -Uri $CreditsUrl -Headers $headers -Method Get -TimeoutSec 20
        $null = $creditsResponse.Content | ConvertFrom-Json
        Write-Info "reset-credit endpoint returned JSON"
    } catch {
        Write-Info "reset-credit endpoint probe failed; app can fall back to usage response when available"
    }

    if ($weeklyWindow) {
        Write-Info "quota probe passed: 5h and weekly windows are recognizable"
    } else {
        Write-Info "quota probe passed: 5h window is recognizable; weekly window was not present"
    }
}

$fingerprint = Get-CodexFingerprint
$previous = Read-PreviousState
$fingerprintJson = ConvertTo-StableJson $fingerprint
$previousFingerprintJson = $null
if ($previous -and $previous.fingerprint) {
    $previousFingerprintJson = ConvertTo-StableJson $previous.fingerprint
}

if (-not $Force -and $previousFingerprintJson -and $previousFingerprintJson -eq $fingerprintJson) {
    Write-Info "Codex install fingerprint is unchanged; skipping full check. Use -Force to run anyway."
    exit 0
}

if ($fingerprint.found) {
    Write-Info "Codex executable: $($fingerprint.path)"
} else {
    Write-Info "Codex executable was not found; continuing with repository checks"
}

Run-Step "frontend unit tests" $RepoRoot "npm.cmd" @("run", "test")
Run-Step "Rust unit tests" (Join-Path $RepoRoot "src-tauri") "cargo" @("test")
Run-Step "web production build" $RepoRoot "npm.cmd" @("run", "build")

if ($SkipLive) {
    Write-Info "live quota probe skipped"
} else {
    Invoke-CodexQuotaProbe
}

$state = [ordered]@{
    checkedAt = (Get-Date).ToUniversalTime().ToString("o")
    fingerprint = $fingerprint
    liveProbeSkipped = [bool]$SkipLive
}
$state | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $StatePath -Encoding UTF8
Write-Info "check passed; state saved to $StatePath"
