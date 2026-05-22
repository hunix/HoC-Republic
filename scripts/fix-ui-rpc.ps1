$fixes = @(
    @{ File = "hoc-ui\src\pages\republic\Resilience.tsx"; From = "republic.resilience.status"; To = "republic.resilience.health" },
    @{ File = "hoc-ui\src\pages\intel\TacticalMap.tsx"; From = "intel.events.list"; To = "republic.intelligence.events" }
)
foreach ($fix in $fixes) {
    if (Test-Path $fix.File) {
        $content = Get-Content $fix.File -Raw
        $content = $content -replace [regex]::Escape($fix.From), $fix.To
        Set-Content $fix.File $content -NoNewline
        Write-Host "Fixed: $($fix.File)"
    }
    else {
        Write-Host "NOT FOUND: $($fix.File)"
    }
}
# Fix compute.local.delete -> compute.local.remove in any tsx file
Get-ChildItem hoc-ui\src\pages -Recurse -Filter "*.tsx" | ForEach-Object {
    $t = Get-Content $_.FullName -Raw
    if ($t -match "compute\.local\.delete") {
        $t = $t -replace "compute\.local\.delete", "compute.local.remove"
        Set-Content $_.FullName $t -NoNewline
        Write-Host "Fixed compute.local.delete in $($_.Name)"
    }
}
Write-Host "All UI fixes applied."
