@echo off
cd /d "%~dp0"
echo === Yams Sandra - Edition Maison V11 ===
go mod tidy
go run .
pause
