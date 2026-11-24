@echo off
chcp 65001 >nul
title تثبيت الذكاء الاصطناعي لتطبيق Zenith - Zenith AI Installer
color 0B

echo ======================================================================
echo          أداة التثبيت التلقائي للذكاء الاصطناعي لتطبيق Zenith
echo ======================================================================
echo.

set "ZENITH_BASE=%APPDATA%\io.github.abdulllrahmandev.zenith"
set "TARGET_AI_MODELS=%ZENITH_BASE%\ai\models"
set "TARGET_MODELS=%ZENITH_BASE%\translator\models"
set "TARGET_RUNTIME=%ZENITH_BASE%\translator\runtime"

echo [1/4] التحقق من مجلدات الذكاء الاصطناعي في AppData...
if not exist "%TARGET_AI_MODELS%" mkdir "%TARGET_AI_MODELS%"
if not exist "%TARGET_MODELS%" mkdir "%TARGET_MODELS%"
if not exist "%TARGET_RUNTIME%" mkdir "%TARGET_RUNTIME%"
echo   + مسار مجلد الذكاء الاصطناعي: %TARGET_AI_MODELS%
echo   + مسار مجلد المترجم الموحد:  %TARGET_MODELS%
echo.

echo [2/4] البحث عن مجلد الذكاء الاصطناعي على سطح المكتب...

set "SOURCE_DIR="
if exist "%USERPROFILE%\Desktop\Zenith_AI" (
    set "SOURCE_DIR=%USERPROFILE%\Desktop\Zenith_AI"
) else if exist "%USERPROFILE%\Desktop\AI" (
    set "SOURCE_DIR=%USERPROFILE%\Desktop\AI"
) else if exist "%USERPROFILE%\Desktop\translator" (
    set "SOURCE_DIR=%USERPROFILE%\Desktop\translator"
) else if exist "%~dp0Zenith_AI" (
    set "SOURCE_DIR=%~dp0Zenith_AI"
) else if exist "%~dp0models" (
    set "SOURCE_DIR=%~dp0"
)

if "%SOURCE_DIR%"=="" (
    echo [!] لم يتم العثور على مجلد باسم Zenith_AI أو AI على سطح المكتب.
    echo     يرجى وضع مجلد الذكاء الاصطناعي باسم "Zenith_AI" على سطح المكتب ثم إعادة تشغيل هذا الملف.
    echo.
    echo المجلدات التي تم البحث فيها:
    echo   - %USERPROFILE%\Desktop\Zenith_AI
    echo   - %USERPROFILE%\Desktop\AI
    echo   - %USERPROFILE%\Desktop\translator
    echo.
    pause
    exit /b 1
)

echo   + تم العثور على المجلد المصدر: %SOURCE_DIR%
echo.

echo [3/4] نقل ملفات الذكاء الاصطناعي...

:: 1. نقل ملف النموذج .gguf
set "FOUND_MODEL=0"
if exist "%SOURCE_DIR%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
    echo   - نقل النموذج: qwen2.5-1.5b-instruct-q4_k_m.gguf
    copy /Y "%SOURCE_DIR%\qwen2.5-1.5b-instruct-q4_k_m.gguf" "%TARGET_AI_MODELS%\" >nul
    copy /Y "%SOURCE_DIR%\qwen2.5-1.5b-instruct-q4_k_m.gguf" "%TARGET_MODELS%\" >nul
    set "FOUND_MODEL=1"
) else if exist "%SOURCE_DIR%\models\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
    echo   - نقل النموذج من مجلد models: qwen2.5-1.5b-instruct-q4_k_m.gguf
    copy /Y "%SOURCE_DIR%\models\qwen2.5-1.5b-instruct-q4_k_m.gguf" "%TARGET_AI_MODELS%\" >nul
    copy /Y "%SOURCE_DIR%\models\qwen2.5-1.5b-instruct-q4_k_m.gguf" "%TARGET_MODELS%\" >nul
    set "FOUND_MODEL=1"
) else (
    for %%f in ("%SOURCE_DIR%\*.gguf") do (
        echo   - نقل النموذج: %%~nxf
        copy /Y "%%f" "%TARGET_AI_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" >nul
        copy /Y "%%f" "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" >nul
        set "FOUND_MODEL=1"
    )
    if not "%FOUND_MODEL%"=="1" (
        for %%f in ("%SOURCE_DIR%\models\*.gguf") do (
            echo   - نقل النموذج: %%~nxf
            copy /Y "%%f" "%TARGET_AI_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" >nul
            copy /Y "%%f" "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" >nul
            set "FOUND_MODEL=1"
        )
    )
)

:: 2. نقل ملفات المشغل Runtime (llama-server.exe وباقي ملفات dll)
set "FOUND_RUNTIME=0"
if exist "%SOURCE_DIR%\runtime" (
    echo   - نقل مجلد المشغل Runtime...
    xcopy /E /I /Y "%SOURCE_DIR%\runtime\*" "%TARGET_RUNTIME%\" >nul
    set "FOUND_RUNTIME=1"
) else if exist "%SOURCE_DIR%\llama-server.exe" (
    echo   - نقل ملفات المشغل المباشرة...
    copy /Y "%SOURCE_DIR%\*.exe" "%TARGET_RUNTIME%\" >nul
    copy /Y "%SOURCE_DIR%\*.dll" "%TARGET_RUNTIME%\" >nul
    set "FOUND_RUNTIME=1"
) else (
    for %%z in ("%SOURCE_DIR%\llama*.zip") do (
        echo   - استخراج ملف المشغل المضغوط: %%~nxz
        tar -xf "%%z" -C "%TARGET_RUNTIME%" 2>nul
        set "FOUND_RUNTIME=1"
    )
)

echo.
echo [4/4] التحقق النهائي من التثبيت...

if exist "%TARGET_AI_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
    echo   [V] نموذج الذكاء الاصطناعي مثبت بنجاح:
    echo       %TARGET_AI_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf
) else if exist "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
    echo   [V] نموذج الذكاء الاصطناعي مثبت بنجاح:
    echo       %TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf
) else (
    echo   [!] تنبيه: لم يتم العثور على ملف النموذج qwen2.5-1.5b-instruct-q4_k_m.gguf
)

if exist "%TARGET_RUNTIME%\llama-server.exe" (
    echo   [V] محرك التشغيل المحلي مثبت بنجاح:
    echo       %TARGET_RUNTIME%\llama-server.exe
) else (
    echo   [*] محرك التشغيل المحلي موجود مسبقاً أو سيتم تحميله تلقائياً عند الحاجة.
)

echo.
echo ======================================================================
echo    اكتملت العملية! يمكنك الآن استخدام الذكاء الاصطناعي محلياً بدون إنترنت
echo    في كل من: الترجمة الفورية (Translator) ومحادثة الذكاء الاصطناعي (AI Chat).
echo ======================================================================
echo.
pause
