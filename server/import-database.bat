@echo off
echo ========================================
echo Importing UAS Admin Database Schema
echo ========================================
echo.
"C:\Program Files\MySQL\MySQL Server 5.7\bin\mysql.exe" -u root uas_admin < "C:\zombie\work\uas_admin.sql"
echo.
echo ========================================
echo Import Complete!
echo ========================================
pause
