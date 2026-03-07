@echo off
chcp 65001 >nul
cd /d "%~dp0"
setlocal enabledelayedexpansion

echo [setup] Demarrage - initialisation des dossiers de configuration...
mkdir "App_Sources\config\grilles" 2>nul
echo [setup] Dossiers App_Sources\config et grilles verifies ou crees.

echo [setup] Copie des fichiers d'exemple vers config (sans ecrasement)...
for %%I in (App_Sources\examples\*.example.js) do (
  set "nom=%%~nI"
  set "nom=!nom:.example=!"
  if not exist "App_Sources\config\!nom!.js" (
    copy "%%I" "App_Sources\config\!nom!.js" >nul
    echo [setup] Copie : %%~nxI -^> !nom!.js
  ) else (
    echo [setup] Deja present, ignore : !nom!.js
  )
)

if not exist "App_Sources\config\grilles\default.json" (
  copy "App_Sources\examples\grilles\default.example.json" "App_Sources\config\grilles\default.json" >nul
  echo [setup] Copie : grilles\default.example.json -^> grilles\default.json
) else (
  echo [setup] Deja present, ignore : grilles\default.json
)

echo [setup] Termine.
pause
