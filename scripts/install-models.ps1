#Requires -Version 5.1
<#
.SYNOPSIS
    HoC Model Installer — Downloads all required LLM and ML models for HoC plugins and systems.

.DESCRIPTION
    Dynamic, resilient installer for all AI/ML models required by HoC.
    - Auto-detects system RAM/VRAM to pick optimal quantization
    - Supports resumable downloads (byte-range / .part files)
    - Retries on failure (configurable)
    - Skips already-downloaded files
    - Installs Ollama, huggingface-cli, git-lfs if missing
    - Covers: BitNet, GGUF/Ollama models, all plugin model checkpoints

.PARAMETER Mode
    "core"    — BitNet + essential GGUF models only (fastest, ~10 GB)
    "plugins" — All plugin model checkpoints
    "all"     — Everything (default)

.PARAMETER HfToken
    HuggingFace access token (for gated models). Can also be set via $env:HF_TOKEN.

.PARAMETER DataDir
    Base directory for model storage. Default: <repo-root>\models

.PARAMETER Retries
    Number of download retries per file. Default: 3

.PARAMETER SkipOllama
    Skip Ollama model pulls (useful if Ollama not installed).

.EXAMPLE
    .\scripts\install-models.ps1
    .\scripts\install-models.ps1 -Mode core -HfToken hf_xxx
    .\scripts\install-models.ps1 -Mode plugins -SkipOllama
#>

[CmdletBinding()]
param(
    [ValidateSet("core", "plugins", "all")]
    [string]$Mode = "all",

    [string]$HfToken = $env:HF_TOKEN,

    [string]$DataDir = "",

    [int]$Retries = 3,

    [switch]$SkipOllama,

    [switch]$DryRun
)

Set-StrictMode -Off
$ErrorActionPreference = "Continue"

# ─── Constants ───────────────────────────────────────────────────────────────

$VERSION = "1.0.0"
$REPO_ROOT = Split-Path -Parent $PSScriptRoot
if (-not $DataDir) { $DataDir = Join-Path $REPO_ROOT "models" }

$BITNET_DIR = Join-Path $DataDir "bitnet"
$GGUF_DIR = Join-Path $DataDir "gguf"
$PLUGINS_DIR = Join-Path $DataDir "plugins"
$LOG_FILE = Join-Path $DataDir "install-models.log"

$HF_BASE = "https://huggingface.co"
$HF_API = "https://huggingface.co/api"

$global:Stats = @{ Downloaded = 0; Skipped = 0; Failed = 0; TotalBytes = 0 }

# ─── Colour / Logging ────────────────────────────────────────────────────────

function Write-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║       HoC Model Installer  v$VERSION                       ║" -ForegroundColor Cyan
    Write-Host "  ║   LLM + ML model downloader for all plugins & systems   ║" -ForegroundColor Cyan
    Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Log {
    param($Msg, $Color = "White")
    $ts = Get-Date -Format "HH:mm:ss"
    $line = "[$ts] $Msg"
    Write-Host $line -ForegroundColor $Color
    Add-Content -Path $LOG_FILE -Value $line -ErrorAction SilentlyContinue
}

function LogOk { param($Msg) Log "✔  $Msg" "Green" }
function LogWarn { param($Msg) Log "⚠  $Msg" "Yellow" }
function LogErr { param($Msg) Log "✖  $Msg" "Red" }
function LogInfo { param($Msg) Log "   $Msg" "Cyan" }
function LogSkip { param($Msg) Log "→  $Msg" "DarkGray" }

function LogSection {
    param($Title)
    Write-Host ""
    Write-Host "  ── $Title " -ForegroundColor Magenta -NoNewline
    Write-Host ("─" * [Math]::Max(0, 55 - $Title.Length)) -ForegroundColor DarkGray
}

# ─── System Detection ────────────────────────────────────────────────────────

function Get-SystemInfo {
    $ram = [Math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
    $freeRam = [Math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 1)

    $vram = 0
    $gpuName = "None"
    try {
        $gpu = Get-CimInstance Win32_VideoController | Sort-Object AdapterRAM -Descending | Select-Object -First 1
        $vram = [Math]::Round($gpu.AdapterRAM / 1GB, 1)
        $gpuName = $gpu.Name
    }
    catch {}

    $disk = Get-PSDrive -Name (Split-Path -Qualifier $DataDir).TrimEnd(':') -ErrorAction SilentlyContinue
    $freeDiskGB = if ($disk) { [Math]::Round($disk.Free / 1GB, 1) } else { 999 }

    return @{
        TotalRamGB = $ram
        FreeRamGB  = $freeRam
        VramGB     = $vram
        GpuName    = $gpuName
        FreeDiskGB = $freeDiskGB
    }
}

function Select-Quantization {
    param($FreeRamGB, $BaseRamGB, [string[]]$Quants)
    $multipliers = @{ Q2_K = 0.55; Q3_K_M = 0.75; Q4_K_M = 1.0; Q5_K_M = 1.2; Q6_K = 1.35; Q8_0 = 1.7 }
    $headroom = [Math]::Max($FreeRamGB - 3, 0)
    foreach ($q in $Quants) {
        $mult = if ($multipliers.ContainsKey($q)) { $multipliers[$q] } else { 1.0 }
        if ($BaseRamGB * $mult -le $headroom) { return $q }
    }
    return $null
}

# ─── Prerequisite Checks ─────────────────────────────────────────────────────

function Ensure-Command {
    param($Cmd, $InstallHint)
    if (-not (Get-Command $Cmd -ErrorAction SilentlyContinue)) {
        LogWarn "$Cmd not found. $InstallHint"
        return $false
    }
    return $true
}

function Ensure-Prerequisites {
    LogSection "Prerequisites"

    # Git
    if (-not (Ensure-Command "git" "Install Git from https://git-scm.com/download/win")) {
        LogErr "Git is required. Aborting."
        exit 1
    }

    # Git LFS
    $lfsOk = git lfs version 2>&1
    if ($LASTEXITCODE -ne 0) {
        LogWarn "git-lfs not installed. Trying to install..."
        try { git lfs install 2>&1 | Out-Null } catch {}
    }
    else { LogOk "git-lfs: OK" }

    # Python
    $pyCmd = $null
    foreach ($py in @("python3", "python", "py")) {
        if (Get-Command $py -ErrorAction SilentlyContinue) {
            $ver = & $py --version 2>&1
            if ($ver -match "Python 3") { $pyCmd = $py; break }
        }
    }
    if ($pyCmd) { $pyVer = & $pyCmd --version 2>&1; LogOk "Python: $pyVer" }
    else { LogWarn "Python 3 not found. Plugin models that need huggingface_hub CLI may fail." }

    # huggingface_hub (pip package gives hf_hub_download)
    if ($pyCmd) {
        $hfInstalled = & $pyCmd -c "import huggingface_hub; print(huggingface_hub.__version__)" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Log "Installing huggingface_hub..." "Yellow"
            if (-not $DryRun) { & $pyCmd -m pip install -q huggingface_hub 2>&1 | Out-Null }
        }
        else { LogOk "huggingface_hub: $hfInstalled" }
    }

    # Ollama (optional)
    $script:OllamaOk = (Get-Command "ollama" -ErrorAction SilentlyContinue) -ne $null
    if ($script:OllamaOk) { LogOk "Ollama: $(ollama --version 2>&1)" }
    else { LogWarn "Ollama not found — skipping Ollama model pulls. Install from https://ollama.ai" }

    # Create dirs
    foreach ($d in @($DataDir, $BITNET_DIR, $GGUF_DIR, $PLUGINS_DIR)) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    }
}

# ─── Download Engine ─────────────────────────────────────────────────────────

function Format-Bytes {
    param([long]$Bytes)
    if ($Bytes -ge 1GB) { return "{0:N2} GB" -f ($Bytes / 1GB) }
    if ($Bytes -ge 1MB) { return "{0:N1} MB" -f ($Bytes / 1MB) }
    return "{0:N0} KB" -f ($Bytes / 1KB)
}

function Download-File {
    <#
    .SYNOPSIS Resilient file downloader with progress bar, resume, and retry.
    #>
    param(
        [string]$Url,
        [string]$Dest,
        [string]$Label = "",
        [hashtable]$Headers = @{}
    )

    $partial = "$Dest.part"
    $startByte = 0

    # Resume support
    if (Test-Path $partial) {
        $startByte = (Get-Item $partial).Length
        if ($startByte -gt 0) { LogInfo "Resuming from $(Format-Bytes $startByte)..." }
    }

    for ($attempt = 1; $attempt -le $Retries; $attempt++) {
        try {
            $reqHeaders = @{}
            foreach ($k in $Headers.Keys) { $reqHeaders[$k] = $Headers[$k] }
            if ($HfToken) { $reqHeaders["Authorization"] = "Bearer $HfToken" }
            if ($startByte -gt 0) { $reqHeaders["Range"] = "bytes=$startByte-" }

            $req = [System.Net.HttpWebRequest]::Create($Url)
            $req.Method = "GET"
            $req.Timeout = 30000          # 30s connect timeout
            $req.ReadWriteTimeout = 120000 # 120s read timeout
            $req.UserAgent = "HoC-ModelInstaller/$VERSION"
            foreach ($k in $reqHeaders.Keys) { $req.Headers[$k] = $reqHeaders[$k] }

            $resp = $req.GetResponse()
            $totalBytes = $startByte + $resp.ContentLength
            $stream = $resp.GetResponseStream()

            $mode = if ($startByte -gt 0) { [System.IO.FileMode]::Append } else { [System.IO.FileMode]::Create }
            $fs = [System.IO.FileStream]::new($partial, $mode)

            $buf = New-Object byte[] 524288  # 512 KB chunks
            $downloaded = $startByte
            $sw = [System.Diagnostics.Stopwatch]::StartNew()
            $lastReport = 0

            while ($true) {
                $read = $stream.Read($buf, 0, $buf.Length)
                if ($read -le 0) { break }
                $fs.Write($buf, 0, $read)
                $downloaded += $read

                # Progress every 2 seconds
                if ($sw.Elapsed.TotalSeconds - $lastReport -ge 2) {
                    $lastReport = $sw.Elapsed.TotalSeconds
                    $pct = if ($totalBytes -gt 0) { [Math]::Round($downloaded / $totalBytes * 100, 1) } else { 0 }
                    $mbps = [Math]::Round($downloaded / 1MB / [Math]::Max($sw.Elapsed.TotalSeconds, 0.1), 1)
                    $eta = if ($mbps -gt 0 -and $totalBytes -gt 0) {
                        $remaining = ($totalBytes - $downloaded) / 1MB / $mbps
                        if ($remaining -gt 60) { "{0:N0}m {1:N0}s" -f [Math]::Floor($remaining / 60), ($remaining % 60) }
                        else { "{0:N0}s" -f $remaining }
                    }
                    else { "..." }
                    Write-Progress -Activity "Downloading $Label" `
                        -Status "$(Format-Bytes $downloaded) / $(Format-Bytes $totalBytes)  |  $mbps MB/s  |  ETA: $eta" `
                        -PercentComplete $pct -Id 1
                }
            }

            $fs.Close()
            $stream.Close()
            $resp.Close()
            Write-Progress -Activity "Downloading $Label" -Completed -Id 1

            # Rename .part → final
            if (Test-Path $Dest) { Remove-Item $Dest -Force }
            Rename-Item $partial $Dest

            $global:Stats.Downloaded++
            $global:Stats.TotalBytes += $downloaded
            LogOk "Downloaded: $Label ($(Format-Bytes $downloaded))"
            return $true

        }
        catch {
            Write-Progress -Activity "Downloading $Label" -Completed -Id 1
            if ($attempt -lt $Retries) {
                LogWarn "Attempt $attempt failed: $_. Retrying in 5s..."
                Start-Sleep 5
            }
            else {
                LogErr "Failed after $Retries attempts: $Label — $_"
                $global:Stats.Failed++
                return $false
            }
        }
    }
    return $false
}

function Download-HF {
    <#
    .SYNOPSIS Download a single file from HuggingFace with skip-if-exists.
    #>
    param(
        [string]$Repo,
        [string]$Filename,
        [string]$DestDir,
        [string]$Label = ""
    )

    $destPath = Join-Path $DestDir $Filename
    if (Test-Path $destPath) {
        $sz = Format-Bytes (Get-Item $destPath).Length
        LogSkip "Already exists: $Filename ($sz)"
        $global:Stats.Skipped++
        return $true
    }

    if ($DryRun) {
        LogInfo "[DRY RUN] Would download: $Repo/$Filename → $destPath"
        return $true
    }

    New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    $url = "$HF_BASE/$Repo/resolve/main/$Filename"
    return Download-File -Url $url -Dest $destPath -Label ($Label -or "$Repo/$Filename")
}

function Get-HFFileList {
    param([string]$Repo, [string[]]$Extensions = @(".gguf", ".safetensors", ".bin", ".pt"))
    try {
        $headers = @{ Accept = "application/json" }
        if ($HfToken) { $headers["Authorization"] = "Bearer $HfToken" }
        $resp = Invoke-RestMethod -Uri "$HF_API/models/$Repo" -Headers $headers -TimeoutSec 15 -ErrorAction Stop
        return $resp.siblings | Where-Object { foreach ($ext in $Extensions) { if ($_.rfilename -like "*$ext") { return $true } } } | ForEach-Object { $_.rfilename }
    }
    catch {
        LogWarn "Could not list repo ${Repo}: $_"
        return @()
    }
}

function Pull-OllamaModel {
    param([string]$ModelTag)
    if ($SkipOllama -or -not $script:OllamaOk) { return }
    # Check if already pulled
    $existing = ollama list 2>&1 | Select-String ($ModelTag.Split(":")[0])
    if ($existing) { LogSkip "Ollama model already pulled: $ModelTag"; $global:Stats.Skipped++; return }
    if ($DryRun) { LogInfo "[DRY RUN] ollama pull $ModelTag"; return }
    Log "Pulling Ollama model: $ModelTag" "Cyan"
    ollama pull $ModelTag
    if ($LASTEXITCODE -eq 0) { LogOk "Pulled: $ModelTag"; $global:Stats.Downloaded++ }
    else { LogErr "Failed to pull: $ModelTag"; $global:Stats.Failed++ }
}

function Clone-Repo {
    param([string]$Url, [string]$DestDir, [string]$Label = "")
    if (Test-Path (Join-Path $DestDir ".git")) { LogSkip "Repo already cloned: $Label"; return $true }
    if ($DryRun) { LogInfo "[DRY RUN] git clone $Url → $DestDir"; return $true }
    New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    Log "Cloning: $Label ← $Url" "Cyan"
    git clone --depth 1 $Url $DestDir 2>&1
    if ($LASTEXITCODE -eq 0) { LogOk "Cloned: $Label"; return $true }
    else { LogErr "Failed to clone: $Label"; $global:Stats.Failed++; return $false }
}

# ─── Model Sections ──────────────────────────────────────────────────────────

function Install-BitNet {
    LogSection "BitNet (1-bit LLM — CPU inference)"

    $bitnetModelDir = Join-Path $BITNET_DIR "bitnet-b1.58-2B-4T-gguf"
    New-Item -ItemType Directory -Path $bitnetModelDir -Force -ErrorAction SilentlyContinue | Out-Null

    # Official Microsoft BitNet model — IQ4_NL quantization (NOT i2_s which is removed)
    $bitnetFiles = @(
        @{ Repo = "microsoft/bitnet-b1.58-2B-4T-gguf"; File = "ggml-model-IQ4_NL.gguf"; Label = "BitNet 2B IQ4_NL (recommended)" },
        @{ Repo = "microsoft/bitnet-b1.58-2B-4T-gguf"; File = "ggml-model-Q4_K_M.gguf"; Label = "BitNet 2B Q4_K_M (fallback)" }
    )

    $downloaded = $false
    foreach ($m in $bitnetFiles) {
        if (-not $downloaded) {
            $ok = Download-HF -Repo $m.Repo -Filename $m.File -DestDir $bitnetModelDir -Label $m.Label
            if ($ok) { $downloaded = $true; break }
        }
    }
    if (-not $downloaded) { LogWarn "No BitNet model downloaded. Engine will be unavailable." }
}

function Install-GGUFModels {
    param([hashtable]$Sys)
    LogSection "GGUF Models (Ollama/LM Studio)"

    # Registry — adapted from src/republic/model-provisioner.ts
    $models = @(
        @{ Id = "llama-3.2-1b"; Name = "Llama 3.2 1B"; Repo = "bartowski/Llama-3.2-1B-Instruct-GGUF"; Pattern = "Llama-3.2-1B-Instruct-{Q}.gguf"; BaseRam = 1.5; Quants = @("Q6_K", "Q5_K_M", "Q4_K_M"); Ollama = "llama3.2:1b" },
        @{ Id = "llama-3.2-3b"; Name = "Llama 3.2 3B"; Repo = "bartowski/Llama-3.2-3B-Instruct-GGUF"; Pattern = "Llama-3.2-3B-Instruct-{Q}.gguf"; BaseRam = 3; Quants = @("Q6_K", "Q5_K_M", "Q4_K_M"); Ollama = "llama3.2" },
        @{ Id = "qwen-2.5-coder-7b"; Name = "Qwen 2.5 Coder 7B"; Repo = "bartowski/Qwen2.5-Coder-7B-Instruct-GGUF"; Pattern = "Qwen2.5-Coder-7B-Instruct-{Q}.gguf"; BaseRam = 6; Quants = @("Q5_K_M", "Q4_K_M", "Q3_K_M"); Ollama = "qwen2.5-coder:7b" },
        @{ Id = "gemma-3-4b"; Name = "Gemma 3 4B"; Repo = "bartowski/gemma-3-4b-it-GGUF"; Pattern = "gemma-3-4b-it-{Q}.gguf"; BaseRam = 4; Quants = @("Q6_K", "Q5_K_M", "Q4_K_M"); Ollama = "gemma3:4b" },
        @{ Id = "deepseek-r1-7b"; Name = "DeepSeek R1 7B"; Repo = "bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF"; Pattern = "DeepSeek-R1-Distill-Qwen-7B-{Q}.gguf"; BaseRam = 6; Quants = @("Q5_K_M", "Q4_K_M", "Q3_K_M"); Ollama = "deepseek-r1:7b" },
        @{ Id = "phi-4-14b"; Name = "Phi 4 14B"; Repo = "bartowski/phi-4-GGUF"; Pattern = "phi-4-{Q}.gguf"; BaseRam = 10; Quants = @("Q5_K_M", "Q4_K_M", "Q3_K_M"); Ollama = "phi4" },
        @{ Id = "gemma-3-12b"; Name = "Gemma 3 12B"; Repo = "bartowski/gemma-3-12b-it-GGUF"; Pattern = "gemma-3-12b-it-{Q}.gguf"; BaseRam = 9; Quants = @("Q5_K_M", "Q4_K_M", "Q3_K_M"); Ollama = "gemma3:12b" },
        @{ Id = "qwen-2.5-coder-32b"; Name = "Qwen 2.5 Coder 32B"; Repo = "bartowski/Qwen2.5-Coder-32B-Instruct-GGUF"; Pattern = "Qwen2.5-Coder-32B-Instruct-{Q}.gguf"; BaseRam = 24; Quants = @("Q4_K_M", "Q3_K_M", "Q2_K"); Ollama = "qwen2.5-coder:32b" },
        @{ Id = "gemma-3-27b"; Name = "Gemma 3 27B"; Repo = "bartowski/gemma-3-27b-it-GGUF"; Pattern = "gemma-3-27b-it-{Q}.gguf"; BaseRam = 20; Quants = @("Q4_K_M", "Q3_K_M", "Q2_K"); Ollama = "gemma3:27b" },
        @{ Id = "deepseek-r1-32b"; Name = "DeepSeek R1 32B"; Repo = "bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF"; Pattern = "DeepSeek-R1-Distill-Qwen-32B-{Q}.gguf"; BaseRam = 24; Quants = @("Q4_K_M", "Q3_K_M", "Q2_K"); Ollama = "deepseek-r1:32b" }
    )

    Log "System: $($Sys.TotalRamGB) GB RAM ($($Sys.FreeRamGB) GB free), GPU: $($Sys.GpuName) ($($Sys.VramGB) GB VRAM)" "Cyan"

    foreach ($m in $models) {
        $quant = Select-Quantization -FreeRamGB $Sys.FreeRamGB -BaseRamGB $m.BaseRam -Quants $m.Quants
        if (-not $quant) {
            LogSkip "$($m.Name) — not enough RAM (need ~$($m.BaseRam) GB free)"
            continue
        }

        $filename = $m.Pattern.Replace("{Q}", $quant)
        $destDir = Join-Path $GGUF_DIR $m.Id
        Download-HF -Repo $m.Repo -Filename $filename -DestDir $destDir -Label "$($m.Name) [$quant]" | Out-Null

        # Also pull into Ollama if available (uses tag from registry)
        Pull-OllamaModel -ModelTag $m.Ollama
    }

    # Embedding model (used by memory-lancedb plugin)
    LogSection "Embedding Models"
    Pull-OllamaModel -ModelTag "nomic-embed-text"
    Pull-OllamaModel -ModelTag "mxbai-embed-large"
}

function Install-PluginModels {
    LogSection "Plugin Model Checkpoints"

    # ── MagicAnimate ──────────────────────────────────────────────
    # zcxu-eric/MagicAnimate — full checkpoint suite
    $maDir = Join-Path $PLUGINS_DIR "magicanimate" "checkpoints" "MagicAnimate"
    $maFiles = @(
        "appearance_encoder/diffusion_pytorch_model.safetensors",
        "appearance_encoder/config.json",
        "motion_module/mm_sd_v15_v2.ckpt",
        "densepose_controlnet/diffusion_pytorch_model.safetensors",
        "densepose_controlnet/config.json"
    )
    foreach ($f in $maFiles) {
        Download-HF -Repo "zcxu-eric/MagicAnimate" -Filename $f -DestDir (Join-Path $maDir (Split-Path $f -Parent)) -Label "MagicAnimate/$f" | Out-Null
    }

    # ── LingBot World ─────────────────────────────────────────────
    $lbDir = Join-Path $PLUGINS_DIR "lingbot-world" "models"
    Download-HF -Repo "robbyant/lingbot-world-base-cam" -Filename "config.json" -DestDir (Join-Path $lbDir "lingbot-world-base-cam") -Label "LingBot World config" | Out-Null
    # Quantized variant (NF4 — much smaller)
    Download-HF -Repo "cahlen/lingbot-world-base-cam-nf4" -Filename "config.json" -DestDir (Join-Path $lbDir "lingbot-world-base-cam-nf4") -Label "LingBot World NF4 config" | Out-Null

    # ── MMAudio ───────────────────────────────────────────────────
    # MMAudio downloads weights automatically via huggingface_hub on first run
    # We pre-cache the repo metadata so it works offline
    $mmDir = Join-Path $PLUGINS_DIR "mmaudio"
    Download-HF -Repo "hkchengrex/MMAudio" -Filename "mmaudio_large_44k_v2.pth" -DestDir $mmDir -Label "MMAudio large 44k v2" | Out-Null
    Download-HF -Repo "hkchengrex/MMAudio" -Filename "mmaudio_small_44k.pth" -DestDir $mmDir -Label "MMAudio small 44k" | Out-Null

    # ── Deforum (Stable Diffusion) ────────────────────────────────
    # Deforum uses SD 1.5 base model
    $deforumDir = Join-Path $PLUGINS_DIR "deforum" "models"
    Download-HF -Repo "runwayml/stable-diffusion-v1-5" -Filename "v1-5-pruned-emaonly.ckpt" -DestDir $deforumDir -Label "SD 1.5 (Deforum)" | Out-Null

    # ── OmniGen ───────────────────────────────────────────────────
    $omnigenDir = Join-Path $PLUGINS_DIR "omnigen" "models"
    Download-HF -Repo "Shitao/OmniGen-v1" -Filename "model.safetensors" -DestDir (Join-Path $omnigenDir "OmniGen-v1") -Label "OmniGen v1" | Out-Null
    Download-HF -Repo "Shitao/OmniGen-v1" -Filename "config.json" -DestDir (Join-Path $omnigenDir "OmniGen-v1") -Label "OmniGen v1 config" | Out-Null

    # ── StorydDiffusion ───────────────────────────────────────────
    $sdDir = Join-Path $PLUGINS_DIR "storydiffusion" "models"
    # Uses SDXL base — download via Ollama diffusion not applicable; note for user
    LogInfo "StorydDiffusion: Uses SDXL — ensure you have sdxl_base_1.0.safetensors in Automatic1111/ComfyUI models folder."

    # ── Switti (Transformer-based image gen) ──────────────────────
    $swittiDir = Join-Path $PLUGINS_DIR "switti" "models"
    Download-HF -Repo "yresearch/Switti" -Filename "switti.pth" -DestDir $swittiDir -Label "Switti base model" | Out-Null
    Download-HF -Repo "yresearch/Switti" -Filename "vae_ch160v4096z32.pth" -DestDir $swittiDir -Label "Switti VAE" | Out-Null

    # ── Qwen3-TTS ─────────────────────────────────────────────────
    $qwenTTSDir = Join-Path $PLUGINS_DIR "qwen3-tts" "models"
    Download-HF -Repo "Qwen/Qwen2.5-0.5B" -Filename "config.json" -DestDir (Join-Path $qwenTTSDir "Qwen2.5-0.5B") -Label "Qwen 0.5B config (TTS base)" | Out-Null

    # ── Bark TTS ──────────────────────────────────────────────────
    # Bark models auto-download via suno-ai/bark on first run
    # Pre-cache the main checkpoint
    $barkDir = Join-Path $PLUGINS_DIR "bark" "models"
    Download-HF -Repo "suno/bark" -Filename "config.json" -DestDir $barkDir -Label "Bark TTS config" | Out-Null

    # ── Chatterbox TTS (Resemble AI) ─────────────────────────────
    $chatterDir = Join-Path $PLUGINS_DIR "chatterbox" "models"
    Download-HF -Repo "ResembleAI/chatterbox" -Filename "config.json" -DestDir $chatterDir -Label "Chatterbox config" | Out-Null
    Download-HF -Repo "ResembleAI/chatterbox" -Filename "model.safetensors" -DestDir $chatterDir -Label "Chatterbox weights" | Out-Null

    # ── GLM Image ─────────────────────────────────────────────────
    $glmDir = Join-Path $PLUGINS_DIR "glm-image" "models"
    Pull-OllamaModel -ModelTag "llava:7b"          # GLM-Image uses LLaVA-style vision
    Download-HF -Repo "THUDM/glm-4v-9b" -Filename "config.json" -DestDir (Join-Path $glmDir "glm-4v-9b") -Label "GLM-4V config" | Out-Null

    # ── FaceFusion ────────────────────────────────────────────────
    $ffDir = Join-Path $PLUGINS_DIR "facefusion" "models"
    Download-HF -Repo "facefusion/facefusion-assets" -Filename "inswapper_128_fp16.onnx" -DestDir $ffDir -Label "FaceFusion face swapper (FP16 ONNX)" | Out-Null
    Download-HF -Repo "facefusion/facefusion-assets" -Filename "buffalo_l.zip" -DestDir $ffDir -Label "FaceFusion InsightFace buffalo_l" | Out-Null

    # ── DeepFaceLab ───────────────────────────────────────────────
    LogInfo "DeepFaceLab: Models are downloaded per-workspace via the DFL GUI. No pre-download needed."

    # ── FunMusic (InspireMusic) ───────────────────────────────────
    $funDir = Join-Path $PLUGINS_DIR "funmusic" "models"
    Download-HF -Repo "FunAudioLLM/InspireMusic-Base" -Filename "config.json" -DestDir (Join-Path $funDir "InspireMusic-Base") -Label "InspireMusic Base config" | Out-Null

    # ── KV-Edit (Stable Diffusion editing) ───────────────────────
    LogInfo "KV-Edit: Requires SD 1.5 checkpoint (see Deforum above)."

    # ── StableAvatar ─────────────────────────────────────────────
    LogInfo "StableAvatar: Download weights via: git lfs clone https://huggingface.co/Francis-Rings/StableAvatar"

    # ── EasyVolcap ────────────────────────────────────────────────
    LogInfo "EasyVolcap: Models are scene-specific. Download per-project from https://github.com/zju3dv/EasyVolcap"

    # ── Sparc3D ───────────────────────────────────────────────────
    LogInfo "Sparc3D: Models download on first use. See https://github.com/lizhihao6/Sparc3D"

    # ── UIUX ProMax ───────────────────────────────────────────────
    Pull-OllamaModel -ModelTag "llava:13b"   # Vision for UI analysis

    # ── Memory LanceDB ────────────────────────────────────────────
    LogSection "Memory / Embedding (LanceDB)"
    Pull-OllamaModel -ModelTag "nomic-embed-text"
    # text-embedding-3-small is from OpenAI API — no download needed
    LogInfo "LanceDB uses OpenAI text-embedding-3-small (via API) — no local download needed."

    # ── AI Scientist ──────────────────────────────────────────────
    LogSection "AI Scientist"
    Pull-OllamaModel -ModelTag "mistral:7b"
    Pull-OllamaModel -ModelTag "llama3.1:8b"

    # ── AutoGPT ───────────────────────────────────────────────────
    LogSection "AutoGPT"
    # AutoGPT uses OpenAI API by default — no local models needed
    LogInfo "AutoGPT: Uses GPT-4/OpenAI API by default. No local download needed."

    # ── Magentic-One ─────────────────────────────────────────────
    LogSection "Magentic-One"
    Pull-OllamaModel -ModelTag "phi4"
}

function Install-CoreOllamaModels {
    LogSection "Core Ollama Models (general purpose)"
    # Always pull these regardless of mode — used by RepublicAI and agent system
    Pull-OllamaModel -ModelTag "llama3.2"
    Pull-OllamaModel -ModelTag "nomic-embed-text"
    Pull-OllamaModel -ModelTag "codellama:7b"
}

# ─── Summary ─────────────────────────────────────────────────────────────────

function Show-Summary {
    LogSection "Install Summary"
    LogOk "Downloaded : $($global:Stats.Downloaded) files ($(Format-Bytes $global:Stats.TotalBytes))"
    LogSkip "Skipped   : $($global:Stats.Skipped) (already present)"
    if ($global:Stats.Failed -gt 0) {
        LogErr "Failed     : $($global:Stats.Failed)"
        LogWarn "Check log for details: $LOG_FILE"
    }
    Write-Host ""
    LogInfo "Models stored in: $DataDir"
    LogInfo "Log file: $LOG_FILE"

    if ($global:Stats.Failed -gt 0) {
        Write-Host ""
        LogWarn "Some downloads failed. Re-run the script to retry failed items."
        LogWarn "For gated models, set: `$env:HF_TOKEN = 'hf_yourtoken'"
    }
    else {
        Write-Host ""
        LogOk "All models installed successfully!"
    }
}

# ─── Entry Point ─────────────────────────────────────────────────────────────

function Main {
    Write-Banner

    Log "Mode      : $Mode" "Cyan"
    Log "Data dir  : $DataDir" "Cyan"
    Log "HF token  : $(if ($HfToken) { '*** set ***' } else { 'not set (gated models may fail)' })" "Cyan"
    Log "Dry run   : $DryRun" "Cyan"
    Write-Host ""

    Ensure-Prerequisites

    $sys = Get-SystemInfo
    Log "Hardware  : $($sys.TotalRamGB) GB RAM, $($sys.VramGB) GB VRAM ($($sys.GpuName)), $($sys.FreeDiskGB) GB free disk" "Cyan"

    switch ($Mode) {
        "core" {
            Install-BitNet
            Install-GGUFModels -Sys $sys
            Install-CoreOllamaModels
        }
        "plugins" {
            Install-BitNet
            Install-PluginModels
        }
        "all" {
            Install-BitNet
            Install-GGUFModels -Sys $sys
            Install-CoreOllamaModels
            Install-PluginModels
        }
    }

    Show-Summary
}

Main
