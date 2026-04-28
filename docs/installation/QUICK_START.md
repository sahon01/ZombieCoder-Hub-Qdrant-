# UAS Admin System - Quick Start Guide

## 5-Minute Setup

### Prerequisites
- Node.js 18+
- MySQL 8.0+
- Git

### Windows

```cmd
# 1. Clone repository
git clone https://github.com/zombiecoder1/comprehensive-documentation-admin-panel-development.git
cd comprehensive-documentation-admin-panel-development

# 2. Install dependencies
npm install
cd server && npm install && cd ..

# 3. Create database
mysql -u root -p < server/database/schema.sql

# 4. Setup environment
# Edit .env.local with your database credentials

# 5. Populate demo data
cd server
npm run populate-demo-data
cd ..

# 6. Start backend (Terminal 1)
cd server
npm run dev

# 7. Start frontend (Terminal 2)
npm run dev

# 8. Open browser
# Visit http://localhost:3000
```

### Linux/macOS

```bash
# 1. Clone repository
git clone https://github.com/zombiecoder1/comprehensive-documentation-admin-panel-development.git
cd comprehensive-documentation-admin-panel-development

# 2. Install dependencies
npm install
cd server && npm install && cd ..

# 3. Create database
mysql -u root -p < server/database/schema.sql

# 4. Setup environment
cp .env.example .env.local
# Edit .env.local if needed

# 5. Populate demo data
cd server
npm run populate-demo-data
cd ..

# 6. Start services
# Terminal 1:
cd server && npm run dev

# Terminal 2:
npm run dev

# 7. Access application
# Open http://localhost:3000
```

---

## Environment Setup

### .env.local (Frontend)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### server/.env (Backend)
```env
PORT=8000
NODE_ENV=development
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=mysql_password
DB_NAME=uas_admin
CORS_ORIGIN=http://localhost:3000
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama3.1:latest

# Admin/settings write auth
UAS_API_KEY=your_uas_api_key_here
```

---

## Verify Installation

```bash
# Check backend health
curl http://localhost:8000/health

# Check frontend
# Visit http://localhost:3000 in browser

# Check database
mysql -u root -p -e "SELECT COUNT(*) FROM uas_admin.ai_models;"
```

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Port 3000 in use | Change PORT in .env or kill process on port 3000 |
| Database connection error | Verify MySQL running, check credentials |
| CORS errors | Check CORS_ORIGIN in server/.env |
| Modules not found | Run `npm install` and `cd server && npm install` |

---

## Next Steps

1. **Explore Dashboard**: View system status and metrics
2. **Test API**: Use curl or Postman to test endpoints
3. **Create Models**: Add new AI models from admin panel
4. **Configure Agents**: Set up agents for specific tasks
5. **Chat Interface**: Test the AI chat functionality

---

## Documentation

- **Full Installation**: See `INSTALLATION.md`
- **API Reference**: See `API_DOCUMENTATION.md`
- **Architecture**: See `ARCHITECTURE.md`
- **Configuration**: See `CONFIGURATION.md`

---

## Support

- GitHub Issues: https://github.com/zombiecoder1/comprehensive-documentation-admin-panel-development/issues
- Documentation: Check markdown files in repository
- Discord: [Add community link when available]

---

**Ready to use!** Start exploring the UAS Admin System.
