@echo off
chcp 65001 >nul
title نقل ملفات الذكاء الاصطناعي إلى المسار الجديد - Zenith AI Migration
color 0A

echo ======================================================================
echo    أداة ترحيل ونقل الذكاء الاصطناعي المحلي لـ Zenith إلى المسار الجديد
echo ======================================================================
echo.

echo [1/5] إيقاف محرك الذكاء الاصطناعي مؤقتاً لتفادي قفل الملفات...
taskkill /F /IM llama-server.exe >nul 2>&1
echo   + تم الفحص.
echo.

set "ZENITH_BASE=%APPDATA%\io.github.abdulllrahmandev.zenith"
set "TARGET_MODELS=%ZENITH_BASE%\ai\models"
set "TARGET_RUNTIME=%ZENITH_BASE%\ai\runtime"
set "OLD_TRANSLATOR=%ZENITH_BASE%\translator"
set "OLD_LEGACY=%APPDATA%\AntigravityTranslator"

echo [2/5] تجهيز المسار الجديد الموحد للذكاء الاصطناعي...
if not exist "%TARGET_MODELS%" mkdir "%TARGET_MODELS%"
if not exist "%TARGET_RUNTIME%" mkdir "%TARGET_RUNTIME%"
echo   + مجلد النماذج: %TARGET_MODELS%
echo   + مجلد المشغل:  %TARGET_RUNTIME%
echo.

echo [3/5] نقل نموذج الذكاء الاصطناعي (Model)...
if exist "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
    echo   + النموذج موجود بالفعل في المسار الجديد.
    if exist "%OLD_TRANSLATOR%\models\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
        echo   - إزالة النسخة المكررة من المسار القديم translator\models لتوفير المساحة...
        del /F /Q "%OLD_TRANSLATOR%\models\qwen2.5-1.5b-instruct-q4_k_m.gguf" >nul 2>&1
    )
) else (
    if exist "%OLD_TRANSLATOR%\models\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
        echo   - نقل النموذج من translator\models...
        move /Y "%OLD_TRANSLATOR%\models\qwen2.5-1.5b-instruct-q4_k_m.gguf" "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" >nul
    )
    if not exist "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
        for %%f in ("%OLD_TRANSLATOR%\models\*.gguf") do (
            if not exist "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
                echo   - نقل النموذج %%~nxf من translator\models...
                move /Y "%%f" "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" >nul
            )
        )
    )
    if not exist "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
        if exist "%OLD_LEGACY%\models\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
            echo   - نقل النموذج من المسار الأقدم AntigravityTranslator\models...
            move /Y "%OLD_LEGACY%\models\qwen2.5-1.5b-instruct-q4_k_m.gguf" "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" >nul
        )
    )
    if not exist "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
        for %%f in ("%OLD_LEGACY%\models\*.gguf") do (
            if not exist "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
                echo   - نقل النموذج %%~nxf من AntigravityTranslator\models...
                move /Y "%%f" "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" >nul
            )
        )
    )
    if not exist "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
        if exist "%ZENITH_BASE%\models\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
            echo   - نقل النموذج من models الرئيسي...
            move /Y "%ZENITH_BASE%\models\qwen2.5-1.5b-instruct-q4_k_m.gguf" "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" >nul
        )
    )
    if not exist "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
        for %%f in ("%ZENITH_BASE%\models\*.gguf") do (
            if not exist "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
                echo   - نقل النموذج %%~nxf من models الرئيسي...
                move /Y "%%f" "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" >nul
            )
        )
    )
)
echo.

echo [4/5] نقل محرك التشغيل المحلي (Runtime) وتنظيف المجلدات القديمة الفارغة...
if exist "%OLD_TRANSLATOR%\runtime\llama-server.exe" (
    if not exist "%TARGET_RUNTIME%\llama-server.exe" (
        echo   - جاري نقل ملفات المحرك من translator\runtime إلى ai\runtime...
        robocopy "%OLD_TRANSLATOR%\runtime" "%TARGET_RUNTIME%" /E /MOVE /NFL /NDL /NJH /NJS >nul
    ) else (
        echo   + المحرك موجود بالفعل في ai\runtime؛ حذف النسخة المكررة من translator\runtime...
        rmdir /S /Q "%OLD_TRANSLATOR%\runtime" >nul 2>&1
    )
) else (
    echo   + لا توجد ملفات runtime في المسار القديم.
)

rmdir "%OLD_TRANSLATOR%\models" 2>nul
rmdir "%OLD_TRANSLATOR%\runtime" 2>nul
rmdir "%OLD_TRANSLATOR%" 2>nul
echo.

echo [5/5] التحقق النهائي من الترحيل...
if exist "%TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf" (
    echo   [V] النموذج جاهز في المسار الصحيح:
    echo       %TARGET_MODELS%\qwen2.5-1.5b-instruct-q4_k_m.gguf
) else (
    echo   [!] تنبيه: لم يتم العثور على ملف النموذج qwen2.5-1.5b-instruct-q4_k_m.gguf
)

if exist "%TARGET_RUNTIME%\llama-server.exe" (
    echo   [V] محرك التشغيل جاهز في المسار الصحيح:
    echo       %TARGET_RUNTIME%\llama-server.exe
) else (
    echo   [!] تنبيه: لم يتم العثور على محرك التشغيل llama-server.exe
)

echo.
echo ======================================================================
echo    اكتمل الترحيل! يمكنك الآن تشغيل Zenith 1.4.1 واستخدام الذكاء
echo    الاصطناعي المحلي من المسار الجديد الموحد مباشرة.
echo ======================================================================
echo.
pause
