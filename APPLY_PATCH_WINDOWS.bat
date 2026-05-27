@echo off
chcp 65001 >nul
setlocal

echo.
echo CRM Navigator v2 role menu patch
echo ================================
echo.

if not exist "assets" (
  echo ERROR: Folder assets not found.
  echo Run this file from the root folder of the vktg repository.
  echo Example: C:\Users\%USERNAME%\Documents\vktg
  echo.
  pause
  exit /b 1
)

if not exist "tools\patch_vktg_nav_roles.py" (
  echo ERROR: tools\patch_vktg_nav_roles.py not found.
  echo Extract all files from the archive into the root folder of vktg first.
  echo.
  pause
  exit /b 1
)

echo Step 1: applying HTML patch...
python tools\patch_vktg_nav_roles.py
if errorlevel 1 (
  echo.
  echo ERROR: Python patch failed.
  echo If Python is not installed, open Microsoft Store and install Python, then run this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo Step 2: checking Git status...
git status

echo.
echo Step 3: committing and pushing...
git add assets/js/nav-v2/role-menu-v2.js assets/js/nav-v2/admin-guard-v2.js *.html tools/patch_vktg_nav_roles.py APPLY_PATCH_WINDOWS.bat README_NAV_PATCH.md 2>nul
git commit -m "Fix nav v2 role based menu and admin guard"
git push origin main

echo.
echo Done. If Git asked for login, complete authorization and run this file again.
echo Wait 1-3 minutes, then check GitHub Pages.
echo.
pause
