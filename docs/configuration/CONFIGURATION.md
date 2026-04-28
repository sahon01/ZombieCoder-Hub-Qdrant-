// ... existing code ...

## Environment Variables

### M1 Required Variables

For Milestone 1 (Core Infrastructure & Dashboard), you need these minimum variables:

\`\`\`bash
# Application Settings
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Unified Agent System (UAS) Backend
UAS_API_URL=http://localhost:5000
UAS_API_KEY=changeme
\`\`\`

### Full Configuration

Create a `.env.local` file in the root directory with the following variables:

// ... existing code ...

---

## Server Configuration

### Dynamic Server Configuration

The admin panel automatically loads server configurations from your `.env` file. The system performs the following checks on startup and periodically:

#### 1. Server Connectivity Verification

The dashboard performs automatic health checks every 30 seconds:

\`\`\`typescript
// Health check endpoints
GET /api/proxy/health  -> UAS_API_URL/health
GET /api/proxy/status  -> UAS_API_URL/status
\`\`\`

#### 2. Response-Based Feature Activation

Features are automatically enabled/disabled based on server responses:

- ✅ **Healthy**: Server responds with `{ status: "healthy" }`
- ⚠️ **Degraded**: Server responds with `{ status: "degraded" }`
- ❌ **Unhealthy**: Server unreachable or returns error

### M1 Implementation

The M1 release includes:

1. **Server Health Card**: Displays real-time server health status
2. **System Status Card**: Shows counts of models, agents, and active connections
3. **Quick Actions Card**: Provides shortcuts to key features
4. **API Proxy**: Secure backend communication through Next.js API routes

All cards automatically refresh every 30 seconds and handle connection failures gracefully.

// ... existing code ...

## Configuration Validation

### M1 Validation

Check your M1 configuration:

\`\`\`bash
# Verify environment variables are loaded
npm run dev

# Check health endpoint
curl http://localhost:3000/api/proxy/health

# Check status endpoint
curl http://localhost:3000/api/proxy/status
\`\`\`

Expected responses:

**Health endpoint:**
\`\`\`json
{
  "status": "healthy",
  "uptime": 12345
}
\`\`\`

**Status endpoint:**
\`\`\`json
{
  "server": {...},
  "models": [{...}],
  "agents": [{...}],
  "stats": {
    "activeConnections": 0
  }
}
\`\`\`

// ... existing code ...

## Troubleshooting

### M1 Common Issues

1. **"UAS_API_URL not configured" error**
   - Ensure `.env.local` exists in project root
   - Verify `UAS_API_URL` is set correctly
   - Restart the dev server after changing env vars

2. **Health card shows "Unhealthy"**
   - Check if backend server is running
   - Test backend directly: `curl http://localhost:5000/health`
   - Verify `UAS_API_KEY` matches backend configuration
   - Check CORS settings on backend

3. **System Status shows 0 for everything**
   - Backend `/status` endpoint may not be implemented
   - Check backend logs for errors
   - Verify API key authentication

4. **Dark theme not applying**
   - Clear browser cache
   - Check `app/globals.css` is loaded
   - Verify Tailwind CSS is configured correctly

// ... existing code ...
\`\`\`

\`\`\`json file="" isHidden
