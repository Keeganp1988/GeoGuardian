@echo off
echo Starting comprehensive cleanup...

echo Stopping Metro bundler...
taskkill /f /im node.exe 2>nul

echo Cleaning Metro cache...
npx expo start --clear

echo Cleaning npm cache...
npm cache clean --force

echo Removing node_modules...
if exist node_modules rmdir /s /q node_modules

echo Cleaning Android build...
cd android
call gradlew clean
cd ..

echo Clearing Gradle cache...
if exist "%USERPROFILE%\.gradle\caches" rmdir /s /q "%USERPROFILE%\.gradle\caches"

echo Reinstalling dependencies...
npm install

echo Cleanup completed!