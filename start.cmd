@echo off
rem Nutzt die mitgelieferten Laufzeiten in runtime\, sonst Python/Node vom System.
setlocal
set "HERE=%~dp0"
if exist "%HERE%runtime\python\python.exe" set "PATH=%HERE%runtime\python;%HERE%runtime\node;%PATH%"
cd /d "%HERE%"
if "%1"=="" (python run_all.py) else (python %*)
