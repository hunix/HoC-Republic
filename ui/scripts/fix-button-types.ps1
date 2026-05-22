
# Fix missing type="button" on all <button> elements in view files
# Skips buttons that already have type=

$viewDir = "c:\Users\H\source\repos\HoC\ui\src\ui"
$files = Get-ChildItem -Path $viewDir -Filter "*.ts" -Recurse | Where-Object { $_.Name -notlike "*.test.ts" }
$fixed = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $original = $content

    # Pattern 1: <button> with no attributes → add type="button"
    $content = $content -replace '<button>', '<button type="button">'

    # Pattern 2: <button followed by space/newline and attrs but NO type= already
    # Matches <button<whitespace><something-not-type=>
    # Use multiline approach: replace <button followed by any word boundary char that isn't type
    # We handle the most common cases:
    # <button class=  <button @click=  <button ?disabled=  <button aria-  <button id=
    $content = [regex]::Replace($content, '<button\b(?!\s+type=)(?=\s+(?:class|@click|\?disabled|aria-|id=|@keydown|style=|\.\.\.spread))', '<button type="button"')

    if ($content -ne $original) {
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
        $fixed++
        Write-Host "Fixed: $($file.Name)"
    }
}

Write-Host "DONE — fixed $fixed files"
