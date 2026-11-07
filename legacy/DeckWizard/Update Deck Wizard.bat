@echo off
rem Rebuild Deck Wizard from the newest ManaBox CSV in the "collection" folder, then open the report.
cd /d "%~dp0"
py deck_wizard.py %*
pause
