<#
.SYNOPSIS
  Download all HoC plugin models with resume support.
  Uses Start-BitsTransfer for large files (native resume).
  Uses .NET WebClient for small files (faster).
  Re-run this script at any time to continue where you left off.
  
  Sections:
    1. HuggingFace plugin models (~60 GB)
    2. BitNet GGUF models → models/bitnet/ (~1.5 GB)
    3. Ollama model pulls
    4. PyTorch + CUDA verification
#>

$ErrorActionPreference = "Continue"
$HF_CACHE = "$env:USERPROFILE\.cache\huggingface\hub"
$BITNET_DIR = Join-Path $PSScriptRoot "..\models\bitnet"

$script:totalDownloaded = 0
$script:totalSkipped = 0
$script:totalFailed = 0

function Get-HFFile {
  param(
    [string]$Repo,
    [string]$FileName,
    [string]$SizeLabel,
    [string]$SubDir
  )

  $orgModel = $Repo -replace "/", "--"
  $baseDir = Join-Path $HF_CACHE "models--$orgModel"
  $baseDir = Join-Path $baseDir "snapshots"
  $baseDir = Join-Path $baseDir "main"
  if ($SubDir -and $SubDir -ne "") { $baseDir = Join-Path $baseDir $SubDir }
  if (-not (Test-Path $baseDir)) { New-Item -Path $baseDir -ItemType Directory -Force | Out-Null }

  $dest = Join-Path $baseDir $FileName
  $urlPath = $FileName
  if ($SubDir -and $SubDir -ne "") { $urlPath = "$SubDir/$FileName" }
  $url = "https://huggingface.co/$Repo/resolve/main/$urlPath"

  if (Test-Path $dest) {
    $existing = (Get-Item $dest).Length
    if ($existing -gt 100) {
      Write-Host "  [SKIP] $FileName ($([math]::Round($existing/1MB, 1)) MB cached)" -ForegroundColor DarkGray
      $script:totalSkipped++
      return
    }
  }

  Write-Host "  [DOWN] $FileName ($SizeLabel) ... " -ForegroundColor Cyan -NoNewline

  try {
    $sizeEstimate = 0
    if ($SizeLabel -match "([\d.]+)\s*GB") { $sizeEstimate = [double]$Matches[1] * 1024 }
    elseif ($SizeLabel -match "([\d.]+)\s*MB") { $sizeEstimate = [double]$Matches[1] }

    if ($sizeEstimate -gt 50) {
      Start-BitsTransfer -Source $url -Destination $dest -DisplayName $FileName -Description "Downloading $FileName from $Repo" -ErrorAction Stop
    }
    else {
      $wc = New-Object Net.WebClient
      $wc.DownloadFile($url, $dest)
    }

    if (Test-Path $dest) {
      $size = (Get-Item $dest).Length
      Write-Host "OK ($([math]::Round($size/1MB, 1)) MB)" -ForegroundColor Green
      $script:totalDownloaded++
    }
    else {
      Write-Host "FAILED (file not created)" -ForegroundColor Red
      $script:totalFailed++
    }
  }
  catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $script:totalFailed++
  }
}

function Get-HFModel {
  param(
    [string]$Repo,
    [string]$DisplayName,
    [array]$Files
  )

  Write-Host ""
  Write-Host "--- $DisplayName ---" -ForegroundColor Yellow
  Write-Host "    $Repo" -ForegroundColor DarkGray

  foreach ($f in $Files) {
    Get-HFFile -Repo $Repo -FileName $f.Name -SizeLabel $f.Size -SubDir $f.SubDir
  }
}

function Get-BitNetGGUF {
  param(
    [string]$Repo,
    [string]$FileName,
    [string]$SizeLabel,
    [string]$DirName
  )

  $targetDir = Join-Path $BITNET_DIR $DirName
  if (-not (Test-Path $targetDir)) { New-Item -Path $targetDir -ItemType Directory -Force | Out-Null }
  $dest = Join-Path $targetDir $FileName

  if (Test-Path $dest) {
    $existing = (Get-Item $dest).Length
    if ($existing -gt 1000) {
      Write-Host "  [SKIP] $FileName ($([math]::Round($existing/1MB, 1)) MB)" -ForegroundColor DarkGray
      $script:totalSkipped++
      return
    }
    # Corrupt/empty — remove and re-download
    Remove-Item $dest -Force
  }

  Write-Host "  [DOWN] $FileName ($SizeLabel) ... " -ForegroundColor Cyan -NoNewline

  $url = "https://huggingface.co/$Repo/resolve/main/$FileName"
  try {
    Start-BitsTransfer -Source $url -Destination $dest -DisplayName $FileName -Description "BitNet GGUF: $FileName" -ErrorAction Stop
    if (Test-Path $dest) {
      $size = (Get-Item $dest).Length
      Write-Host "OK ($([math]::Round($size/1MB, 1)) MB)" -ForegroundColor Green
      $script:totalDownloaded++
    }
    else {
      Write-Host "FAILED" -ForegroundColor Red
      $script:totalFailed++
    }
  }
  catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $script:totalFailed++
  }
}

# === Banner ===

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  HoC Plugin Model Downloader - BITS Transfer (Resume)"      -ForegroundColor Magenta
Write-Host "  Re-run at any time to continue interrupted downloads"      -ForegroundColor Magenta
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "HF Cache: $HF_CACHE" -ForegroundColor DarkGray
Write-Host "BitNet:   $BITNET_DIR" -ForegroundColor DarkGray

# ================================================================
# SECTION 1: HuggingFace Plugin Models (~60 GB)
# ================================================================

Write-Host ""
Write-Host "  [SECTION 1/4] HuggingFace Plugin Models" -ForegroundColor White

# === 1. BARK TTS (suno/bark) ===

Get-HFModel -Repo "suno/bark" -DisplayName "Bark TTS (Suno AI) - Small + Large" -Files @(
  @{ Name = "text.pt"; Size = "2.32 GB" },
  @{ Name = "coarse.pt"; Size = "1.25 GB" },
  @{ Name = "fine.pt"; Size = "1.11 GB" },
  @{ Name = "text_2.pt"; Size = "5.35 GB" },
  @{ Name = "coarse_2.pt"; Size = "3.93 GB" },
  @{ Name = "fine_2.pt"; Size = "3.74 GB" },
  @{ Name = "pytorch_model.bin"; Size = "4.49 GB" },
  @{ Name = "config.json"; Size = "8.8 KB" },
  @{ Name = "generation_config.json"; Size = "4.9 KB" },
  @{ Name = "tokenizer.json"; Size = "2.9 MB" },
  @{ Name = "tokenizer_config.json"; Size = "353 B" },
  @{ Name = "vocab.txt"; Size = "996 KB" },
  @{ Name = "special_tokens_map.json"; Size = "125 B" },
  @{ Name = "speaker_embeddings_path.json"; Size = "61 KB" }
)

# === 2. CHATTERBOX TTS (ResembleAI/chatterbox) ===

Get-HFModel -Repo "ResembleAI/chatterbox" -DisplayName "Chatterbox TTS (Resemble AI)" -Files @(
  @{ Name = "s3gen.safetensors"; Size = "1.06 GB" },
  @{ Name = "t3_cfg.safetensors"; Size = "2.13 GB" },
  @{ Name = "ve.safetensors"; Size = "5.7 MB" },
  @{ Name = "conds.pt"; Size = "107 KB" },
  @{ Name = "tokenizer.json"; Size = "25.5 KB" },
  @{ Name = "t3_23lang.safetensors"; Size = "2.14 GB" },
  @{ Name = "t3_mtl23ls_v2.safetensors"; Size = "2.14 GB" },
  @{ Name = "mtl_tokenizer.json"; Size = "68.1 KB" },
  @{ Name = "grapheme_mtl_merged_expanded_v1.json"; Size = "70 KB" },
  @{ Name = "Cangjie5_TC.json"; Size = "1.92 MB" }
)

# === 3. STABLE DIFFUSION 2.1 (Deforum) ===

Get-HFModel -Repo "stabilityai/stable-diffusion-2-1" -DisplayName "Stable Diffusion 2.1 (Deforum)" -Files @(
  @{ Name = "v2-1_768-ema-pruned.safetensors"; Size = "5.21 GB" }
)

# === 4. MMAUDIO (hkchengrex/MMAudio) ===

Get-HFModel -Repo "hkchengrex/MMAudio" -DisplayName "MMAudio (Video/Text to Audio)" -Files @(
  @{ Name = "weights_v2.pth"; Size = "2.5 GB" },
  @{ Name = "weights.pth"; Size = "2.5 GB" },
  @{ Name = "best_listener.pth"; Size = "1.3 GB" }
)

# === 5. SWITTI (yresearch/Switti) ===

Get-HFModel -Repo "yresearch/Switti" -DisplayName "Switti (Fast Text to Image)" -Files @(
  @{ Name = "switti.safetensors"; Size = "3.5 GB" }
)

# === 6. OMNIGEN (Shitao/OmniGen-v1) ===

Get-HFModel -Repo "Shitao/OmniGen-v1" -DisplayName "OmniGen v1 (Universal Image Gen)" -Files @(
  @{ Name = "model.safetensors"; Size = "7.5 GB" },
  @{ Name = "config.json"; Size = "1 KB" },
  @{ Name = "special_tokens_map.json"; Size = "1 KB" },
  @{ Name = "tokenizer.json"; Size = "7 MB" },
  @{ Name = "tokenizer_config.json"; Size = "1 KB" }
)

# === 7. SDXL BASE (StoryDiffusion) ===

Get-HFModel -Repo "stabilityai/stable-diffusion-xl-base-1.0" -DisplayName "SDXL Base 1.0 (StoryDiffusion)" -Files @(
  @{ Name = "sd_xl_base_1.0.safetensors"; Size = "6.94 GB" }
)

# === 8. STABLE ZERO123 (3D Gen) ===

Get-HFModel -Repo "stabilityai/stable-zero123" -DisplayName "Stable Zero123 (3D Gen)" -Files @(
  @{ Name = "stable_zero123.ckpt"; Size = "8.58 GB" }
)

# === 9. SD VAE (Face/Avatar) ===

Get-HFModel -Repo "stabilityai/sd-vae-ft-mse" -DisplayName "SD VAE (Face/Avatar Pipelines)" -Files @(
  @{ Name = "diffusion_pytorch_model.safetensors"; Size = "335 MB" },
  @{ Name = "config.json"; Size = "547 B" }
)

# === 10. FLUX.1 Dev (KV-Edit, 24+ GB VRAM) ===

Get-HFModel -Repo "black-forest-labs/FLUX.1-dev" -DisplayName "FLUX.1 Dev (KV-Edit, 24+ GB VRAM)" -Files @(
  @{ Name = "flux1-dev.safetensors"; Size = "23.8 GB" }
)

# === 11. FACEFUSION GFPGAN (TencentARC/gfpgan) ===

Get-HFModel -Repo "TencentARC/gfpgan" -DisplayName "FaceFusion GFPGAN (Face Restoration)" -Files @(
  @{ Name = "GFPGANv1.3.pth"; Size = "332 MB" },
  @{ Name = "GFPGANv1.4.pth"; Size = "348 MB" }
)

# === 12. MAGICIANIMATE (zcxu-eric/MagicAnimate) ===

Get-HFModel -Repo "zcxu-eric/MagicAnimate" -DisplayName "MagicAnimate (Image Animation)" -Files @(
  @{ Name = "appearance_encoder/diffusion_pytorch_model.safetensors"; Size = "858 MB"; SubDir = "appearance_encoder" },
  @{ Name = "densepose_controlnet/diffusion_pytorch_model.safetensors"; Size = "1.36 GB"; SubDir = "densepose_controlnet" },
  @{ Name = "temporal_attention/temporal_attention.ckpt"; Size = "1.67 GB"; SubDir = "temporal_attention" }
)

# === 13. INSPIREMUSIC (FunAudioLLM/InspireMusic-Base) ===

Get-HFModel -Repo "FunAudioLLM/InspireMusic-Base" -DisplayName "InspireMusic Base (Music Generation)" -Files @(
  @{ Name = "llm.pt"; Size = "1.8 GB" },
  @{ Name = "flow.pt"; Size = "850 MB" },
  @{ Name = "hift.pt"; Size = "170 MB" }
)

# === 14. QWEN3 TTS (Qwen/Qwen3-TTS) ===

Get-HFModel -Repo "Qwen/Qwen3-TTS" -DisplayName "Qwen3 TTS (Text to Speech)" -Files @(
  @{ Name = "model.safetensors"; Size = "2.32 GB" },
  @{ Name = "config.json"; Size = "1 KB" },
  @{ Name = "tokenizer.json"; Size = "7 MB" }
)

# === 15. GLM COGVIEW4 (THUDM/CogView4-6B) ===

Get-HFModel -Repo "THUDM/CogView4-6B" -DisplayName "CogView4 6B (GLM Image Gen)" -Files @(
  @{ Name = "model-00001-of-00003.safetensors"; Size = "4.95 GB" },
  @{ Name = "model-00002-of-00003.safetensors"; Size = "4.89 GB" },
  @{ Name = "model-00003-of-00003.safetensors"; Size = "2.12 GB" },
  @{ Name = "config.json"; Size = "1 KB" }
)

# ================================================================
# SECTION 2: BitNet GGUF Models → models/bitnet/ (~1.5 GB)
# ================================================================

Write-Host ""
Write-Host "  [SECTION 2/4] BitNet GGUF Models" -ForegroundColor White

Write-Host ""
Write-Host "--- BitNet b1.58 Large (Q4_K_M, ~450 MB) ---" -ForegroundColor Yellow
Write-Host "    RichardErkhov/1bitLLM_-_bitnet_b1_58-large-gguf" -ForegroundColor DarkGray

Get-BitNetGGUF `
  -Repo "RichardErkhov/1bitLLM_-_bitnet_b1_58-large-gguf" `
  -FileName "bitnet_b1_58-large.Q4_K_M.gguf" `
  -SizeLabel "450 MB" `
  -DirName "1bitLLM--bitnet_b1_58-large"

Write-Host ""
Write-Host "--- BitNet b1.58 3B (Q4_K_M, ~1.0 GB) ---" -ForegroundColor Yellow
Write-Host "    RichardErkhov/1bitLLM_-_bitnet_b1_58-3B-gguf" -ForegroundColor DarkGray

Get-BitNetGGUF `
  -Repo "RichardErkhov/1bitLLM_-_bitnet_b1_58-3B-gguf" `
  -FileName "bitnet_b1_58-3B.Q4_K_M.gguf" `
  -SizeLabel "1.0 GB" `
  -DirName "1bitLLM--bitnet_b1_58-3B"

# ================================================================
# SECTION 3: Ollama Models
# ================================================================

Write-Host ""
Write-Host "  [SECTION 3/4] Ollama Model Pulls" -ForegroundColor White

$ollamaModels = @(
  @{ Name = "llama3.2"; Size = "2 GB" },
  @{ Name = "qwen2.5:3b"; Size = "1.9 GB" },
  @{ Name = "codellama:7b"; Size = "3.8 GB" },
  @{ Name = "mistral:7b"; Size = "4.1 GB" },
  @{ Name = "phi3.5:3.8b"; Size = "2.2 GB" },
  @{ Name = "deepseek-coder-v2:lite"; Size = "8.9 GB" }
)

$ollamaAvailable = $false
try {
  $null = ollama list 2>&1
  $ollamaAvailable = $true
}
catch { }

if ($ollamaAvailable) {
  foreach ($m in $ollamaModels) {
    $exists = (ollama list 2>&1) | Select-String $m.Name
    if ($exists) {
      Write-Host "  [SKIP] $($m.Name) (already pulled)" -ForegroundColor DarkGray
      $script:totalSkipped++
    }
    else {
      Write-Host "  [PULL] $($m.Name) ($($m.Size)) ..." -ForegroundColor Cyan
      try {
        ollama pull $m.Name 2>&1 | Out-Null
        Write-Host "  [OK]   $($m.Name)" -ForegroundColor Green
        $script:totalDownloaded++
      }
      catch {
        Write-Host "  [FAIL] $($m.Name): $($_.Exception.Message)" -ForegroundColor Red
        $script:totalFailed++
      }
    }
  }
}
else {
  Write-Host "  [WARN] Ollama not found. Install from https://ollama.com" -ForegroundColor Yellow
}

# ================================================================
# SECTION 4: PyTorch + CUDA Verification
# ================================================================

Write-Host ""
Write-Host "  [SECTION 4/4] PyTorch + CUDA Check" -ForegroundColor White

$pytorchOk = $false
try {
  $result = python -c "import torch; print(f'PyTorch {torch.__version__} CUDA={torch.cuda.is_available()}')" 2>&1
  Write-Host "  [INFO] $result" -ForegroundColor Green
  if ($result -match "CUDA=True") { $pytorchOk = $true }
}
catch { }

if (-not $pytorchOk) {
  Write-Host "  [WARN] PyTorch not found or CUDA not available. Installing..." -ForegroundColor Yellow
  Write-Host "         pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124" -ForegroundColor DarkGray
  try {
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124 2>&1 | Out-Null
    $result = python -c "import torch; print(f'PyTorch {torch.__version__} CUDA={torch.cuda.is_available()}')" 2>&1
    Write-Host "  [OK]   $result" -ForegroundColor Green
  }
  catch {
    Write-Host "  [FAIL] PyTorch install failed. Run manually:" -ForegroundColor Red
    Write-Host "         pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124" -ForegroundColor Yellow
  }
}

# === Summary ===

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  Download Summary" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  Downloaded: $script:totalDownloaded" -ForegroundColor Green
Write-Host "  Skipped:    $script:totalSkipped (already cached)" -ForegroundColor DarkGray

if ($script:totalFailed -gt 0) {
  Write-Host "  Failed:     $script:totalFailed" -ForegroundColor Red
}
else {
  Write-Host "  Failed:     0" -ForegroundColor Green
}

$totalSize = 0
Get-ChildItem -Path $HF_CACHE -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { $totalSize += $_.Length }
$bitnetSize = 0
Get-ChildItem -Path $BITNET_DIR -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object { $bitnetSize += $_.Length }
Write-Host ""
Write-Host "  HF cache size:    $([math]::Round($totalSize/1GB, 2)) GB" -ForegroundColor Yellow
Write-Host "  BitNet size:      $([math]::Round($bitnetSize/1MB, 1)) MB" -ForegroundColor Yellow
Write-Host "  HF cache:         $HF_CACHE" -ForegroundColor DarkGray
Write-Host "  BitNet models:    $BITNET_DIR" -ForegroundColor DarkGray

# Show Ollama status
if ($ollamaAvailable) {
  Write-Host ""
  Write-Host "  Ollama Models:" -ForegroundColor Cyan
  ollama list 2>&1 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
}

if ($script:totalFailed -gt 0) {
  Write-Host ""
  Write-Host "  Some downloads failed. Re-run this script to retry." -ForegroundColor Red
}

Write-Host ""
