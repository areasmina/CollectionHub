@echo off
rem Deck Wizard as a local app: drop a new collection CSV or add decks on the Collection page.
rem Keep this window open while you use it. Close it (or press Ctrl+C) to stop.
cd /d "%~dp0"
py deck_wizard.py --serve %*
pause
