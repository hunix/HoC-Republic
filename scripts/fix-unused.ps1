$files = @(
    'hoc-ui\src\pages\republic\RAG.tsx',
    'hoc-ui\src\pages\republic\Vision.tsx'
)
foreach ($f in $files) {
    $path = (Resolve-Path $f).Path
    [string]$c = [System.IO.File]::ReadAllText($path)
    $c = $c.Replace(', RefreshCw', '').Replace('RefreshCw, ', '').Replace(', Upload', '').Replace('Upload, ', '')
    [System.IO.File]::WriteAllText($path, $c)
    Write-Host "Fixed: $f"
}
Write-Host "All done."
