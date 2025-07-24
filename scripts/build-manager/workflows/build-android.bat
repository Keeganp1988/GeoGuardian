@echo off
echo Building Android application...

echo Validating environment...
call node scripts/build-manager/index.js validate
if errorlevel 1 (
    echo Environment validation failed
    exit /b 1
)

echo Cleaning previous build...
cd android
call gradlew clean
cd ..

echo Building APK...
cd android
call gradlew assembleDebug
cd ..

echo Build completed!
echo APK location: android/app/build/outputs/apk/debug/

echo Installing on device...
for %%f in (android\app\build\outputs\apk\debug\*.apk) do (
    adb install -r "%%f"
)

echo Android build and install completed!