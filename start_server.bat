@echo off
cd /d "%~dp0"
echo HTTP server wo kidou shimasu...
echo Browser de http://localhost:8000/index.html wo hirakimasu
echo.
start http://localhost:8000/index.html

where py >nul 2>nul
if not errorlevel 1 goto USE_PY

where python >nul 2>nul
if not errorlevel 1 goto USE_PYTHON

echo Python ga mitsukarimasen deshita. Python wo install shite kudasai.
pause
goto END

:USE_PY
py -m http.server 8000
goto DONE

:USE_PYTHON
python -m http.server 8000
goto DONE

:DONE
echo.
echo Server wo shuuryou shimashita.
pause

:END
