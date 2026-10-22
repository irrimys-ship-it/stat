# Обработчик ссылок openpath:<путь> — открывает папку в проводнике или выделяет файл.
# Ничего не запускает: файлы только подсвечиваются в проводнике (explorer /select).
param([string]$Url)

Add-Type -AssemblyName System.Web
$p = $Url -replace '^openpath:(//)?', ''
$p = [System.Web.HttpUtility]::UrlDecode($p).Trim().Trim('"').TrimEnd('/')
$p = $p -replace '/', '\'

if (-not $p) { exit }
if (Test-Path -LiteralPath $p -PathType Container) {
  Start-Process explorer.exe -ArgumentList "`"$p`""
} elseif (Test-Path -LiteralPath $p -PathType Leaf) {
  Start-Process explorer.exe -ArgumentList "/select,`"$p`""
} else {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("Путь не найден:`n$p", 'openpath') | Out-Null
}
