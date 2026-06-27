$dist = Join-Path $PSScriptRoot "..\dist"
$assets = Join-Path $PSScriptRoot "..\public\assets"

function Get-DirSize($path) {
    if (-not (Test-Path $path)) { return 0 }
    return (Get-ChildItem $path -Recurse -File | Measure-Object -Property Length -Sum).Sum
}

$distSize = Get-DirSize $dist
$assetSize = Get-DirSize $assets

Write-Host "Frontend dist: $([math]::Round($distSize / 1KB, 1)) KB"
Write-Host "Runtime assets: $([math]::Round($assetSize / 1MB, 2)) MB"
Write-Host "Total (frontend + assets): $([math]::Round(($distSize + $assetSize) / 1MB, 2)) MB"
Write-Host ""
Write-Host "Target: install bundle < 20 MB (+ WebView runtime on system)"
