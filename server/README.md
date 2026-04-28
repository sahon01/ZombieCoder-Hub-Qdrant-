# UAS TypeScript Server

একটি TypeScript সার্ভার যা ওলামা AI মডেলের সাথে সংযুক্ত এবং UAS Admin Panel এর জন্য ব্যাকএন্ড API সরবরাহ করে।

## ✅ বর্তমান অবস্থা (Current Status)

- **Public Gateway (Cloudflare-facing)**
  - `PUBLIC_GATEWAY_ENABLED=true` হলে সার্ভার `9000` পোর্টে একটি গেটওয়ে চালায়।
  - গেটওয়ে কনফিগ ডিফল্টভাবে পড়ে **official cloudflared YAML** ফাইল থেকে:
    - `server/config/cloudflared.yml`
  - ওই YAML-এর `tunnel` এবং `ingress` থেকে hostname → target routes লোড হয়।
  - কনফিগ ঠিক না থাকলে গেটওয়ে চলবে কিন্তু public proxy 503 দিবে (degraded mode)।

- **ChromaDB (Managed / Bootstrap)**
  - `RAG_ENABLED=true` এবং `RAG_VECTOR_BACKEND=chroma` হলে সার্ভার Chroma health-check করে।
  - `CHROMA_MANAGED=true` হলে Chroma চালু করার চেষ্টা করবে।
  - Windows এ Python `pip` সংক্রান্ত সমস্যার কারণে bootstrap/runner troubleshoot অংশ দেখুন।

## 🚀 দ্রুত শুরু

### ১. ডিপেন্ডেন্সি ইনস্টল করুন

\`\`\`bash
cd server
npm install
\`\`\`

### ২. এনভায়রনমেন্ট কনফিগার করুন

`.env` ফাইলটি কপি করুন এবং আপনার প্রয়োজন অনুযায়ী সম্পাদনা করুন:

\`\`\`bash
# Server Configuration
PORT=8000
NODE_ENV=development
HOST=localhost

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=codellama:7b

# Security
API_KEY=your_uas_api_key_here
CORS_ORIGIN=http://localhost:3000
\`\`\`

### ৩. সার্ভার চালু করুন

**ডেভেলপমেন্ট মোড:**

\`\`\`bash
npm run dev
\`\`\`

**প্রোডাকশন মোড:**

```bash
npm run build
npm start
```

## 🌐 Cloudflare / Public Gateway (Official YAML)

এই প্রজেক্টে Cloudflare টানেল রাউটিংয়ের **single source of truth** হিসেবে cloudflared-এর অফিসিয়াল YAML ব্যবহার করা হয়:

- ফাইল: `server/config/cloudflared.yml`
- গুরুত্বপূর্ণ keys:
  - `tunnel: <UUID>`
  - `ingress:` array
    - `hostname: a.smartearningplatformbd.net`
    - `service: http://127.0.0.1:8000` (example)

### Gateway config override (ঐচ্ছিক)

যদি জরুরি অবস্থায় env দিয়ে override করতে চান:

- `PUBLIC_GATEWAY_CONFIG_PATH` (ডিফল্ট `config/cloudflared.yml`)
- `PUBLIC_GATEWAY_ROUTES` (JSON array). এটা থাকলে YAML routes ignore হবে।

## 🧠 RAG / ChromaDB

### Recommended env (Windows/Linux)

```bash
RAG_ENABLED=true
RAG_VECTOR_BACKEND=chroma
CHROMA_URL=http://127.0.0.1:8001
CHROMA_COLLECTION=zombiecoder_metadata
CHROMA_MANAGED=true
CHROMA_BOOTSTRAP=true
CHROMA_BOOTSTRAP_VENV=.chroma_venv
```

### Known issue (Windows) — pip InvalidVersion

কিছু Windows Python সেটাপে `pip` user-site (`AppData\Roaming\Python\Python312`) থেকে লোড হয়ে `InvalidVersion: '3.12.0'` এরর দিতে পারে।

এই কারণে bootstrap `PYTHONNOUSERSITE=1` ব্যবহার করে user-site disable করার চেষ্টা করে। যদি তারপরও pip ভাঙা থাকে:

- **অপশন A (Recommended)**: Python stable release (3.12.x stable) ইন্সটল করুন
- **অপশন B**: Docker/Remote Chroma ব্যবহার করুন এবং `CHROMA_MANAGED=false` রাখুন

## 🔒 Admin / Runtime Controls

নিচের endpoints গুলো `X-API-Key` দিয়ে প্রোটেক্টেড (`UAS_API_KEY` বা `API_KEY`) :

- `GET /settings/services`
- `POST /settings/services/chroma/reload`
- `POST /settings/services/chroma/start`
- `POST /settings/services/chroma/stop`
- `POST /settings/services/public-gateway/reload`

## 📡 API এন্ডপয়েন্টসমূহ

### Health & Status

- `GET /health` - সার্ভার হেলথ চেক
- `GET /health/detailed` - বিস্তারিত হেলথ ইনফরমেশন
- `GET /status` - সিস্টেম স্ট্যাটাস
- `GET /status/agents` - এজেন্ট স্ট্যাটাস
- `GET /status/models` - মডেল স্ট্যাটাস

### Chat & AI

- `POST /chat/message` - চ্যাট মেসেজ পাঠান
- `POST /chat/stream` - স্ট্রিমিং চ্যাট
- `POST /chat/generate` - টেক্সট জেনারেশন
- `GET /chat/history` - চ্যাট হিস্টরি

### Models

- `GET /models` - সব মডেলের লিস্ট
- `GET /models/:modelName` - নির্দিষ্ট মডেলের তথ্য
- `POST /models/pull` - নতুন মডেল ডাউনলোড
- `POST /models/test` - মডেল টেস্ট

### Agents

- `GET /agents` - সব এজেন্টের লিস্ট
- `GET /agents/:agentId/status` - এজেন্ট স্ট্যাটাস
- `POST /agents/:agentId/start` - এজেন্ট শুরু করুন
- `POST /agents/:agentId/stop` - এজেন্ট বন্ধ করুন
- `POST /agents/:agentId/call` - এজেন্ট কল করুন

### Memory

- `GET /memory/conversations` - কনভারসেশন লিস্ট
- `GET /memory/:conversationId` - কনভারসেশন মেসেজ
- `POST /memory/store` - ডেটা স্টোর করুন
- `GET /memory/retrieve/:key` - ডেটা রিট্রিভ করুন
- `POST /memory/search` - মেমোরি সার্চ করুন

### CLI Agent

- `POST /cli-agent/execute` - কমান্ড এক্সিকিউট করুন
- `GET /cli-agent/system-info` - সিস্টেম ইনফরমেশন
- `GET /cli-agent/allowed-commands` - অনুমোদিত কমান্ড
- `POST /cli-agent/test` - CLI টেস্ট

### Editor Integration

- `POST /editor/send` - এডিটরে কনটেন্ট পাঠান
- `GET /editor/file-info` - ফাইল ইনফরমেশন
- `GET /editor/list-directory` - ডিরেক্টরি লিস্ট
- `GET /editor/test` - এডিটর টেস্ট

## 🔧 কনফিগারেশন

### Ollama সেটআপ

1. Ollama ইনস্টল করুন: <https://ollama.ai/>
2. একটি মডেল ডাউনলোড করুন: `ollama pull codellama:7b`
3. Ollama সার্ভার চালু করুন: `ollama serve`

### এনভায়রনমেন্ট ভ্যারিয়েবল

```bash
# সার্ভার কনফিগারেশন
PORT=8000
NODE_ENV=development
HOST=localhost

# ওলামা কনফিগারেশন
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=codellama:7b

# ডাটাবেজ (ঐচ্ছিক)
DATABASE_URL=mysql://root:password@localhost:3306/uas_admin

# নিরাপত্তা
API_KEY=your_uas_api_key_here
SESSION_SECRET=your_session_secret_here
CORS_ORIGIN=http://localhost:3000

# ফিচার ফ্ল্যাগ
MEMORY_AGENT_ENABLED=true
CLI_AGENT_ENABLED=true
LOAD_BALANCER_ENABLED=true
AUDIO_CHAT_ENABLED=false
```

## 🌐 WebSocket সাপোর্ট

সার্ভার WebSocket কানেকশন সাপোর্ট করে রিয়েল-টাইম আপডেটের জন্য:

```javascript
const ws = new WebSocket('ws://localhost:8000');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

// ইভেন্ট সাবস্ক্রাইব করুন
ws.send(JSON.stringify({
  type: 'subscribe',
  data: { events: ['agent.status', 'metrics.update'] }
}));
```

## 📊 মনিটরিং

### লগ ফাইল

- `logs/error.log` - এরর লগ
- `logs/combined.log` - সব লগ
- `logs/exceptions.log` - এক্সেপশন লগ

### হেলথ চেক

```bash
curl http://localhost:8000/health
```

### Public Gateway status

```bash
curl http://127.0.0.1:9000/status
```

### RAG/Chroma status

```bash
curl http://127.0.0.1:8000/status/rag
```

## 🔒 নিরাপত্তা

- API Key অথেনটিকেশন
- CORS কনফিগারেশন
- পাথ ট্রাভার্সাল সুরক্ষা
- কমান্ড এক্সিকিউশন সীমাবদ্ধতা
- রেট লিমিটিং

## 🚀 Admin Panel এর সাথে সংযোগ

Admin Panel এর `.env.local` ফাইলে এই URL যোগ করুন:

```bash
UAS_API_URL=http://localhost:8000
UAS_API_KEY=your_uas_api_key_here
```

## 🛠️ ট্রাবলশুটিং

### ওলামা কানেকশন সমস্যা

```bash
# ওলামা সার্ভার চেক করুন
curl http://localhost:11434/api/tags

# ওলামা রিস্টার্ট করুন
ollama serve
```

### পোর্ট কনফ্লিক্ট

```bash
# পোর্ট 8000 ব্যবহারে আছে কিনা চেক করুন
netstat -ano | findstr :8000
```

### লগ চেক করুন

```bash
tail -f logs/combined.log
```

## 📝 ডেভেলপমেন্ট

### নতুন রুট যোগ করুন

1. `src/routes/` ফোল্ডারে নতুন রুট ফাইল তৈরি করুন
2. `src/index.ts` এ রুট ইমপোর্ট করুন
3. `app.use('/new-route', newRouteRouter)` যোগ করুন

### নতুন সার্ভিস যোগ করুন

1. `src/services/` ফোল্ডারে সার্ভিস ফাইল তৈরি করুন
2. প্রয়োজন অনুযায়ী রুটে ব্যবহার করুন

## 📄 লাইসেন্স

MIT License

## 🤝 সহায়তা

কোনো সমস্যা হলে লগ ফাইল চেক করুন বা GitHub এ ইস্যু তৈরি করুন।
