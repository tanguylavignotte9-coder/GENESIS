@echo off
rem ==========================================================================
rem  GENESIS - Windows launcher (double-click to play)
rem  1. Use Node.js from PATH, or download a portable Node.js into .runtime\
rem  2. Run "npm ci" when node_modules\ is missing or package-lock.json changed
rem  3. Build then start the game ("npm start")
rem  No administrator rights needed. Messages are in French for the player.
rem ==========================================================================
setlocal EnableExtensions
chcp 65001 >nul
title GENESIS
cd /d "%~dp0"

set "NODE_VERSION=24.22.3"
set "NODE_MIN_MAJOR=22"
set "RUNTIME_DIR=%~dp0.runtime"
set "LOCK_STAMP=%RUNTIME_DIR%\package-lock.installed.json"

set "NODE_ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "NODE_ARCH=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "NODE_ARCH=arm64"
set "NODE_DIST_NAME=node-v%NODE_VERSION%-win-%NODE_ARCH%"
set "PORTABLE_NODE_DIR=%RUNTIME_DIR%\%NODE_DIST_NAME%"

echo ==================================================
echo                GENESIS - Lanceur
echo ==================================================
echo.

rem ---------------------------------------------------------------- 1. Node.js
echo [1/3] Recherche de Node.js...
set "NODE_MAJOR=0"
where node >nul 2>nul
if errorlevel 1 goto :node_not_in_path
for /f "tokens=1 delims=." %%v in ('node -p process.versions.node 2^>nul') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% GEQ %NODE_MIN_MAJOR% goto :node_from_system
echo       Node.js version %NODE_MAJOR% trouvé, mais il faut la version %NODE_MIN_MAJOR% ou plus récente.
goto :node_portable

:node_not_in_path
echo       Node.js n'est pas installé sur ce PC : le jeu va utiliser sa propre copie.
goto :node_portable

:node_from_system
echo       Node.js version %NODE_MAJOR% trouvé sur ce PC.
goto :dependencies

:node_portable
if exist "%PORTABLE_NODE_DIR%\node.exe" goto :node_portable_ready
echo       Téléchargement de Node.js %NODE_VERSION% portable (une seule fois, environ 30 Mo)...
if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"
set "GENESIS_NODE_URL=https://nodejs.org/dist/v%NODE_VERSION%/%NODE_DIST_NAME%.zip"
set "GENESIS_NODE_SUMS=https://nodejs.org/dist/v%NODE_VERSION%/SHASUMS256.txt"
set "GENESIS_NODE_ZIP=%RUNTIME_DIR%\%NODE_DIST_NAME%.zip"
set "GENESIS_RUNTIME_DIR=%RUNTIME_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $name = Split-Path -Leaf $env:GENESIS_NODE_ZIP; Invoke-WebRequest -UseBasicParsing -Uri $env:GENESIS_NODE_URL -OutFile $env:GENESIS_NODE_ZIP; $sums = [string](Invoke-WebRequest -UseBasicParsing -Uri $env:GENESIS_NODE_SUMS).Content; $line = $sums -split [char]10 | Where-Object { $_.TrimEnd().EndsWith(' ' + $name) } | Select-Object -First 1; if (-not $line) { throw ('Empreinte introuvable pour ' + $name) }; $expected = ($line.Trim() -split '\s+')[0]; $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $env:GENESIS_NODE_ZIP).Hash; if ($actual -ne $expected) { throw 'Empreinte SHA-256 incorrecte : fichier corrompu.' }; Expand-Archive -Force -LiteralPath $env:GENESIS_NODE_ZIP -DestinationPath $env:GENESIS_RUNTIME_DIR; Remove-Item -LiteralPath $env:GENESIS_NODE_ZIP"
if errorlevel 1 goto :error_node_download
if not exist "%PORTABLE_NODE_DIR%\node.exe" goto :error_node_download
echo       Node.js portable installé dans .runtime\

:node_portable_ready
set "PATH=%PORTABLE_NODE_DIR%;%PATH%"
echo       Node.js portable %NODE_VERSION% utilisé.

rem ----------------------------------------------------------- 2. Dependencies
:dependencies
echo.
echo [2/3] Vérification des dépendances...
if not exist "node_modules\" goto :install_dependencies
if not exist "%LOCK_STAMP%" goto :install_dependencies
fc /b "package-lock.json" "%LOCK_STAMP%" >nul 2>nul
if errorlevel 1 goto :install_dependencies
echo       Dépendances déjà à jour.
goto :build_and_start

:install_dependencies
echo       Installation des dépendances (npm ci). La première fois, cela peut prendre quelques minutes...
if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"
if exist "%LOCK_STAMP%" del /q "%LOCK_STAMP%"
call npm ci --no-audit --no-fund
if errorlevel 1 goto :error_dependencies
copy /y "package-lock.json" "%LOCK_STAMP%" >nul
echo       Dépendances installées.

rem ------------------------------------------------------- 3. Build and start
:build_and_start
echo.
echo [3/3] Construction puis lancement du jeu...
call npm start
if errorlevel 1 goto :error_start
endlocal
exit /b 0

rem ------------------------------------------------------------------- Errors
:error_node_download
echo.
echo [ERREUR] Impossible de télécharger ou d'installer Node.js portable.
echo          Vérifiez votre connexion Internet, puis relancez Lancer-GENESIS.bat.
echo          Vous pouvez aussi installer Node.js vous-même depuis https://nodejs.org
goto :fail

:error_dependencies
echo.
echo [ERREUR] L'installation des dépendances (npm ci) a échoué.
echo          Vérifiez votre connexion Internet, puis relancez Lancer-GENESIS.bat.
echo          Si le problème persiste, supprimez le dossier node_modules et réessayez.
goto :fail

:error_start
echo.
echo [ERREUR] La construction ou le lancement du jeu a échoué.
echo          Lisez les messages ci-dessus pour comprendre la cause.
goto :fail

:fail
echo.
pause
endlocal
exit /b 1
