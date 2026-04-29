@echo off
chcp 65001 >nul
echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║        🧟 ZombieCoder WebSocket MCP Server v2.0        ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
echo Features:
echo   ✅ 24-Hour Session Persistence
echo   ✅ Real-time Editor Monitoring
echo   ✅ Agent Integration (7 Agents)
echo   ✅ Session Restoration
echo.
echo Access URLs:
echo   📱 HTML Client: http://localhost:8080
echo   🔌 WebSocket: ws://localhost:8080
echo   📊 Health: http://localhost:8080/health
echo   🤖 Agents: http://localhost:8080/api/agents
echo.
echo Press Ctrl+C to stop the server
echo.

node wsoket_mcp.js

pause
