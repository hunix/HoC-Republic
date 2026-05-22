$path = (Resolve-Path 'hoc-ui\src\pages\republic\Vision.tsx').Path
[string]$c = [System.IO.File]::ReadAllText($path)
$c = $c.Replace('<Upload size={16} />', '<BarChart2 size={16} />')
[System.IO.File]::WriteAllText($path, $c)
Write-Host "Fixed Vision.tsx Upload JSX reference"
