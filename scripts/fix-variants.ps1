$files = @(
    'hoc-ui\src\pages\infra\Supabase.tsx',
    'hoc-ui\src\pages\infra\VectorDB.tsx',
    'hoc-ui\src\pages\republic\Research.tsx',
    'hoc-ui\src\pages\republic\Revenue.tsx',
    'hoc-ui\src\pages\republic\Voice.tsx',
    'hoc-ui\src\pages\republic\Workflows.tsx'
)
foreach ($f in $files) {
    [string]$c = [System.IO.File]::ReadAllText((Resolve-Path $f).Path)
    # Replace any remaining "default" string occurrences (in function bodies, ternaries, etc.)
    $c = $c.Replace('"default"', '"neutral"')
    $c = $c.Replace("'default'", "'neutral'")
    [System.IO.File]::WriteAllText((Resolve-Path $f).Path, $c)
    Write-Host "Fixed: $f"
}
Write-Host "All done."
