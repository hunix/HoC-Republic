$c = [System.IO.File]::ReadAllText((Resolve-Path 'hoc-ui\src\lib\navigation.ts').Path)
$c = $c.Replace('icon: Cog,', 'icon: Cpu,')
[System.IO.File]::WriteAllText((Resolve-Path 'hoc-ui\src\lib\navigation.ts').Path, $c)
Write-Host "Done fixing navigation.ts"
