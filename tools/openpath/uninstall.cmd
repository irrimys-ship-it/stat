@echo off
reg delete "HKCU\Software\Classes\openpath" /f
rmdir /s /q "%LOCALAPPDATA%\openpath"
echo openpath handler removed.
pause
