@echo off
chcp 65001 >nul
title تثبيت الذكاء الاصطناعي لتطبيق Zenith - Zenith AI Installer
color 0B

echo ======================================================================
echo          أداة النقل والتثبيت التلقائي للذكاء الاصطناعي لتطبيق Zenith
echo ======================================================================
echo.

set "ZENITH_BASE=%APPDATA%\io.github.abdulllrahmandev.zenith"
set "TARGET_AI_MODELS=%ZENITH_BASE%\ai\models"
set "TARGET_RUNTIME=%ZENITH_BASE%\ai\runtime"
set "TARGET_MODELS_LEGACY=%ZENITH_BASE%\translator\models"

echo [1/4] التحقق من مجلدات الذكاء الاصطناعي في AppData...
if not exist "%TARGET_AI_MODELS%" mkdir "%TARGET_AI_MODELS%"
if not exist "%TARGET_RUNTIME%" mkdir "%TARGET_RUNTIME%"
if not exist "%TARGET_MODELS_LEGACY%" mkdir "%TARGET_MODELS_LEGACY%"
echo   + مسار التثبيت النهائي: %TARGET_AI_MODELS%
echo.

echo [2/4] البحث عن ملفات الذكاء الاصطناعي على سطح المكتب...

set "SOURCE_DIR="
if exist "%USERPROFILE%\Desktop\Zenith_AI" (
    set "SOURCE_DIR=%USERPROFILE%\Desktop\Zenith_AI"
) else if exist "%USERPROFILE%\Desktop\AI" (
    set "SOURCE_DIR=%USERPROFILE%\Desktop\AI"
) else if exist "%USERPROFILE%\Desktop\*.gguf" (
    set "SOURCE_DIR=%USERPROFILE%\Desktop"
) else if exist "%~dp0Zenith_AI" (
    set "SOURCE_DIR=%~dp0Zenith_AI"
) else if exist "%~dp0*.gguf" (
    set "SOURCE_DIR=%~dp0"
) else if exist "%~dp0models" (
    set "SOURCE_DIR=%~dp0"
)

if "%SOURCE_DIR%"=="" (
    echo [!] لم يتم العثور على ملفات أو مجلد الذكاء الاصطناعي على سطح المكتب.
    echo     يرجى وضع مجلد "Zenith_AI" أو ملف النموذج مباشرة على سطح المكتب ثم إعادة التشغيل.
    echo.
    pause
    exit /b 1
)

echo   + تم العثور على المصدر: %SOURCE_DIR%
echo.

echo [3/4] نقل الملفات (Cut / Move) إلى مسار البرنامج...

:: 1. نقل ملف النموذج .gguf
set "FOUND_MODEL=0"
if exist "%SOURCE_DIR%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
    echo   - جاري نقل ملف النموذج: qwen2.5-1.5b-instruct-q4_k_m.gguf
    move /Y "%SOURCE_DIR%\qwen2.5-1.5b-instruct-q4_k_m.gguf" "%TARGET_AI_MODELS%\" >nul
    set "FOUND_MODEL=1"
) else if exist "%SOURCE_DIR%\models\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
    echo   - جاري نقل ملف النموذج: qwen2.5-1.5b-instruct-q4_k_m.gguf
    move /Y "%SOURCE_DIR%\models\qwen2.5-1.5b-instruct-q4_k_m.gguf" "%TARGET_AI_MODELS%\" >nul
    set "FOUND_MODEL=1"
) else (
    for %%f in ("%SOURCE_DIR%\*.gguf") do (
        echo   - جاري نقل ملف النموذج: %%~nxf
        move /Y "%%f" "%TARGET_AI_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" >nul
        set "FOUND_MODEL=1"
    )
    if not "%FOUND_MODEL%"=="1" (
        for %%f in ("%SOURCE_DIR%\models\*.gguf") do (
            echo   - جاري نقل ملف النموذج: %%~nxf
            move /Y "%%f" "%TARGET_AI_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" >nul
            set "FOUND_MODEL=1"
        )
    )
)

:: 2. نقل ملفات المشغل Runtime (llama-server.exe و ملفات dll)
set "FOUND_RUNTIME=0"
if exist "%SOURCE_DIR%\runtime\llama-server.exe" (
    echo   - جاري نقل محرك ومكتبات التشغيل Runtime...
    robocopy "%SOURCE_DIR%\runtime" "%TARGET_RUNTIME%" /E /MOVE /NFL /NDL /NJH /NJS >nul
    set "FOUND_RUNTIME=1"
) else if exist "%SOURCE_DIR%\llama-server.exe" (
    echo   - جاري نقل محرك التشغيل ومكتبات dll...
    move /Y "%SOURCE_DIR%\*.exe" "%TARGET_RUNTIME%\" >nul
    move /Y "%SOURCE_DIR%\*.dll" "%TARGET_RUNTIME%\" >nul
    set "FOUND_RUNTIME=1"
) else (
    for %%z in ("%SOURCE_DIR%\llama*.zip") do (
        echo   - استخراج ملف المحرك المضغوط...
        tar -xf "%%z" -C "%TARGET_RUNTIME%" 2>nul
        del /Q "%%z" 2>nul
        set "FOUND_RUNTIME=1"
    )
)

:: إنشاء رابط توافق في المسار القديم إن لزم الأمر
if exist "%TARGET_AI_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
    if not exist "%TARGET_MODELS_LEGACY%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
        copy /Y "%TARGET_AI_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" "%TARGET_MODELS_LEGACY%\" >nul 2>&1
    )
)

echo.
echo [4/4] التحقق النهائي...

if exist "%TARGET_AI_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
    echo   [V] تم نقل نموذج الذكاء الاصطناعي بنجاح:
    echo       %TARGET_AI_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf
) else (
    echo   [!] لم يتم العثور على ملف النموذج qwen2.5-1.5b-instruct-q4_k_m.gguf
)

if exist "%TARGET_RUNTIME%\llama-server.exe" (
    echo   [V] محرك التشغيل المحلي مثبت بنجاح:
    echo       %TARGET_RUNTIME%\llama-server.exe
)

echo.
echo ======================================================================
echo    تم الانتهاء بنجاح!
echo    تم نقل الملفات إلى مكانها الصحيح.
echo    عند فتح Zenith، سيتعرف البرنامج على الذكاء الاصطناعي فوراً كـ Local Model
echo    دون الحاجة لتحميل أي شيء من الإنترنت.
echo ======================================================================
echo.
pause
