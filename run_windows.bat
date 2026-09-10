@echo off
cd /d "%~dp0"
echo === Yams Mobile Online V1 ===
go mod tidy
go run .
pause
