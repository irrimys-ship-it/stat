# Регистрирует ссылки openpath: для текущего пользователя (без прав администратора).
$dir = Join-Path $env:LOCALAPPDATA 'openpath'
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot 'openpath.ps1') (Join-Path $dir 'openpath.ps1')

$key = 'HKCU:\Software\Classes\openpath'
New-Item -Force $key | Out-Null
Set-ItemProperty $key '(default)' 'URL:openpath'
Set-ItemProperty $key 'URL Protocol' ''
New-Item -Force "$key\shell\open\command" | Out-Null
$cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$dir\openpath.ps1`" `"%1`""
Set-ItemProperty "$key\shell\open\command" '(default)' $cmd

Write-Host 'Готово: ссылки openpath: теперь открывают папки в проводнике.'
Write-Host 'При первом клике браузер спросит разрешение — поставь галочку «Всегда разрешать».'
