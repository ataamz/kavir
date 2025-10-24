# PowerShell script to download SheetJS (xlsx.full.min.js) into vendor folder
$vendorDir = Join-Path -Path $PSScriptRoot -ChildPath "..\vendor"
if(-not (Test-Path $vendorDir)) { New-Item -ItemType Directory -Path $vendorDir | Out-Null }
$dest = Join-Path $vendorDir "xlsx.full.min.js"
$uri = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
Write-Output "Downloading SheetJS from $uri to $dest"
try{
    Invoke-WebRequest -Uri $uri -OutFile $dest -UseBasicParsing
    Write-Output "Downloaded to $dest"
}catch{
    Write-Error "Failed to download: $_"
}
