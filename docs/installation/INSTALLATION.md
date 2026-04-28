# UAS Admin System - Installation Guide

## Table of Contents
- [System Requirements](#system-requirements)
- [Installation - Windows](#installation-windows)
- [Installation - Linux/macOS](#installation-linuxmacos)
- [Database Setup](#database-setup)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## System Requirements

### Minimum Requirements
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **MySQL**: v8.0 or higher
- **RAM**: 4GB minimum (8GB recommended)
- **Disk Space**: 2GB minimum

### Optional Dependencies
- **Ollama**: For local LLM support (can be installed separately)
- **Docker**: For containerized deployment

### Supported Operating Systems
- Windows 10/11 (64-bit)
- Ubuntu 20.04 LTS or later
- macOS 11 or later
- Any Linux distribution with Node.js support

---

## Installation - Windows

### Step 1: Prerequisites

1. **Install Node.js**
   - Download from https://nodejs.org/ (LTS version recommended)
   - Run the installer and follow the setup wizard
   - Verify installation:
     ```cmd
     node --version
     npm --version
     ```

2. **Install MySQL**
   - Download from https://dev.mysql.com/downloads/mysql/
   - Run the installer with default settings
   - Set a root password (remember this for later)
   - Verify installation:
     ```cmd
     mysql --version
     ```

### Step 2: Clone the Repository

```cmd
git clone https://github.com/zombiecoder1/comprehensive-documentation-admin-panel-development.git
cd comprehensive-documentation-admin-panel-development
```

### Step 3: Install Dependencies

```cmd
# Install frontend dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..
```

### Step 4: Database Setup

1. **Create database and schema**:
   ```cmd
   mysql -u root -p < server/database/schema.sql
   ```

2. **Populate demo data**:
   ```cmd
   cd server
   npm run populate-demo-data
   cd ..
   ```

### Step 5: Configure Environment Variables

Create `.env.local` in the project root:
```env
# Frontend Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Server Configuration
PORT=8000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=uas_admin
```

Create `server/.env`:
```env
PORT=8000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=uas_admin

# Ollama Configuration (optional)
OLLAMA_URL=http://localhost:11434
```

### Step 6: Start the Application

**Terminal 1 - Start the backend server**:
```cmd
cd server
npm run dev
```

**Terminal 2 - Start the frontend**:
```cmd
npm run dev
```

Visit http://localhost:3000 in your browser.

---

## Installation - Linux/macOS

### Step 1: Prerequisites

1. **Install Node.js** (using nvm recommended):
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 20
   nvm use 20
   ```

2. **Install MySQL**
   
   **Ubuntu/Debian**:
   ```bash
`   sudo apt update
   sudo apt install mysql-server
   sudo mysql_secure_installation
`   ```

   **macOS**:
   ```bash
   brew install mysql
   brew services start mysql
   mysql_secure_installation
   ```

3. **Verify installations**:
   ```bash
   node --version
   npm --version
   mysql --version
   ```

### Step 2: Clone the Repository

```bash
git clone https://github.com/zombiecoder1/comprehensive-documentation-admin-panel-development.git
cd comprehensive-documentation-admin-panel-development
```

### Step 3: Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..
```

### Step 4: Database Setup

1. **Create database and schema**:
   ```bash
   mysql -u root -p < server/database/schema.sql
   ```

2. **Populate demo data**:
   ```bash
   cd server
   npm run populate-demo-data
   cd ..
   ```

### Step 5: Configure Environment Variables

Create `.env.local` in the project root:
```bash
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF
```

Create `server/.env`:
```bash
cat > server/.env << 'EOF'
PORT=8000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password_here
DB_NAME=uas_admin
OLLAMA_URL=http://localhost:11434
EOF
```

### Step 6: Start the Application

**Terminal 1 - Start backend**:
```bash
cd server
npm run dev
```

**Terminal 2 - Start frontend**:
```bash
npm run dev
```

Visit http://localhost:3000

---

## Database Setup

### Schema Overview

The database contains the following tables:

| Table | Purpose | Rows (Demo) |
|-------|---------|------------|
| `ai_providers` | LLM provider configurations | 4 |
| `ai_models` | AI models from providers | 7 |
| `agents` | Agent configurations | 3 |
| `agent_memory` | Agent memory storage | 3 |
| `conversations` | Chat conversations | 3 |
| `messages` | Chat messages | 6 |
| `prompt_templates` | Prompt templates | 3 |
| `editor_integrations` | Editor integrations | 3 |
| `system_settings` | System configuration | 6 |
| `api_audit_logs` | API request logs | - |

### Manual Database Setup

If automated setup fails:

```bash
# Connect to MySQL
mysql -u root -p

# Run these commands
CREATE DATABASE uas_admin;
USE uas_admin;
SOURCE /path/to/server/database/schema.sql;
```

---

## Configuration

### Environment Variables Reference

#### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000      # Backend API URL
NEXT_PUBLIC_APP_URL=http://localhost:3000      # Frontend URL
```

#### Backend (server/.env)
```env
PORT=8000                                       # Server port
NODE_ENV=development|production                 # Environment
CORS_ORIGIN=http://localhost:3000              # Allowed CORS origin

DB_HOST=localhost                              # MySQL host
DB_USER=root                                   # MySQL user
DB_PASSWORD=your_password                      # MySQL password
DB_NAME=uas_admin                              # Database name

OLLAMA_URL=http://localhost:11434             # Ollama endpoint
```

### Database Connection Pool

The connection pool has been configured with:
- **Connection Limit**: 10
- **Wait for Connections**: true
- **Queue Limit**: 0 (unlimited)

Adjust in `server/src/database/connection.ts` if needed.

---

## Running the Application

### Development Mode

```bash
# Terminal 1: Start backend
cd server
npm run dev

# Terminal 2: Start frontend (from project root)
npm run dev
```

### Production Mode

```bash
# Build frontend
npm run build

# Start backend (from server directory)
npm run build
npm start

# Start frontend (from project root)
npm start
```

### Using the Start Script (Windows)

```cmd
cd server
start.bat
```

---

## Verification

### 1. Check Backend Health

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "uptime": 123.456,
  "database": "connected"
}
```

### 2. Check Frontend

Visit http://localhost:3000 and verify the dashboard loads.

### 3. Test API Endpoints

```bash
# Get all models
curl http://localhost:8000/models

# Get all agents
curl http://localhost:8000/agents

# Get system status
curl http://localhost:8000/status
```

### 4. Database Verification

```bash
mysql -u root -p uas_admin
SELECT COUNT(*) FROM ai_providers;  -- Should show 4
SELECT COUNT(*) FROM ai_models;     -- Should show 7
SELECT COUNT(*) FROM agents;        -- Should show 3
```

---

## Troubleshooting

### Port Already in Use

If port 3000 or 8000 is already in use:

**Windows**:
```cmd
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Linux/macOS**:
```bash
lsof -i :3000
kill -9 <PID>
```

### Database Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

**Solutions**:
1. Verify MySQL is running
2. Check credentials in `.env`
3. Ensure database `uas_admin` exists

**Windows**:
```cmd
mysql -u root -p -e "SELECT 1;"
```

**Linux**:
```bash
sudo service mysql restart
```

### Frontend Not Loading

1. Clear browser cache (Ctrl+Shift+Delete)
2. Check console for errors (F12)
3. Verify backend is running: `curl http://localhost:8000`
4. Restart development server

### CORS Errors

If you see CORS errors in the browser console:

1. Verify `CORS_ORIGIN` in `server/.env`
2. Ensure frontend and backend URLs match settings
3. Restart the backend server

### Ollama Connection Issues

If Ollama features don't work:

1. Install Ollama from https://ollama.ai
2. Start Ollama: `ollama serve`
3. Verify connection:
   ```bash
   curl http://localhost:11434/api/tags
   ```

### Database Migration Issues

If demo data population fails:

```bash
# Reset database
mysql -u root -p uas_admin < server/database/schema.sql

# Re-populate
cd server
npm run populate-demo-data
```

---

## Version Information

- **Node.js**: v18.0.0+
- **npm**: v9.0.0+
- **Next.js**: 15.2.8
- **React**: 19
- **TypeScript**: 5.3.3+
- **MySQL**: 8.0+
- **Express**: 4.18.2
- **MySQL2**: 3.6.5

---

## Support

For issues or questions:
1. Check this guide thoroughly
2. Review error messages in console/logs
3. Visit GitHub Issues: https://github.com/zombiecoder1/comprehensive-documentation-admin-panel-development/issues
4. Contact the development team

---

**Last Updated**: January 2026
**Status**: Production Ready
