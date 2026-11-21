@echo off
set "JAVA_HOME=C:\Program Files\Android\openjdk\jdk-21.0.8"
set "ANDROID_HOME=c:\Users\vatsa\OneDrive\Attachments\Documents\ChatGPT\margrakshak\android-sdk"
set "GRADLE_USER_HOME=c:\Users\vatsa\OneDrive\Attachments\Documents\ChatGPT\margrakshak\.gradle"
cd /d "%~dp0"
call .\gradlew.bat assembleDebug --stacktrace
