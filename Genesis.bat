@echo off
chcp 65001 >nul 2>&1
title Genesis
cd /d "%~dp0"

echo ============================================
echo   GENESIS - simulateur de civilisation
 echo ============================================

if not exist node_modules\electron\dist\electron.exe (
  echo [1/2] Installation des dependances (npm install) - a faire une seule fois...
  call npm install
  if errorlevel 1 (
    echo ERREUR: npm install a echoue. Verifiez que Node.js est installe.
    pause
    exit /b 1
  )
)

if exist release\Genesis-*-portable.exe (
  echo Lancement de l'executable portable...
  for %%f in (release\Genesis-*-portable.exe) do start "" "%%f"
  exit /b 0
)

echo [2/2] Compilation puis lancement en mode fenetre (npm start)...
call npm run build
if errorlevel 1 (
  echo ERREUR: compilation echouee.
  pause
  exit /b 1
)
call npm start
pause
