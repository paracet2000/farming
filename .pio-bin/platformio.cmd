@echo off
set "PIO_PYTHON=%USERPROFILE%\.platformio\penv\Scripts\python.exe"
if not exist "%PIO_PYTHON%" (
  echo PlatformIO Python not found: "%PIO_PYTHON%"
  exit /b 1
)
"%PIO_PYTHON%" -m platformio %*
