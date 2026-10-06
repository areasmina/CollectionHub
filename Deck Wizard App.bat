@echo off
rem Deck Wizard as a local app: report with an "Upload new collection CSV" button.
rem Keep this window open while you use it. Close it (or press Ctrl+C) to stop.
cd /d "%~dp0"
py deck_wizard.py --serve %*
pause
