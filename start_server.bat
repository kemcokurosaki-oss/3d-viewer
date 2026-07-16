@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo HTTPサーバーを起動しています...
echo ブラウザで http://localhost:8000/index.html を開きます
echo サーバーを停止するには、このウィンドウを閉じるか Ctrl+C を押してください
echo.
start http://localhost:8000/index.html
python -m http.server 8000
if errorlevel 1 (
    echo Pythonが見つかりません。Python3を試します...
    python3 -m http.server 8000
    if errorlevel 1 (
        echo Pythonが見つかりませんでした。
        echo Pythonをインストールするか、Node.jsのhttp-serverを使用してください。
        pause
    )
)
