# UAS Admin System - API Documentation

## Base URL
```
http://localhost:8000
```

## Authentication
Authentication is enforced for sensitive write routes using an API key.

- Read-only routes are public (primarily `GET`).
- Write routes (`POST`/`PUT`/`DELETE`) for admin settings and prompt templates require `X-API-Key`.

Header:

```http
X-API-Key: ${UAS_API_KEY}
Content-Type: application/json
```

---

## Endpoints

### Health & Status

#### GET /health
Check server health status
```bash
curl http://localhost:8000/health
```

**Response**:
```json
{
  "status": "healthy",
  "uptime": 123.456,
  "timestamp": "2024-01-24T10:30:00Z"
}
```

#### GET /status
Get detailed system status
```bash
curl http://localhost:8000/status
```

**Response**:
```json
{
  "system": "UAS Admin System",
  "version": "1.0.0",
  "status": "running",
  "uptime": 123.456,
  "database": "connected",
  "ollama": "connected"
}
```

---

### Models API

#### GET /models
Get all AI models with provider information
```bash
curl http://localhost:8000/models
```

**Query Parameters**:
- `provider_id` (optional): Filter by provider ID

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "model_name": "gpt-4",
      "model_version": "1106-preview",
      "status": "running",
      "cpu_usage": 45.2,
      "memory_usage": 58.3,
      "requests_handled": 156,
      "provider_name": "OpenAI",
      "provider_type": "openai",
      "created_at": "2024-01-24T10:00:00Z"
    }
  ],
  "count": 7,
  "source": "database"
}
```

#### GET /models/:id
Get specific model details
```bash
curl http://localhost:8000/models/1
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "model_name": "gpt-4",
    "model_version": "1106-preview",
    "status": "running",
    "cpu_usage": 45.2,
    "memory_usage": 58.3,
    "requests_handled": 156,
    "provider_id": 1,
    "provider_name": "OpenAI",
    "provider_type": "openai"
  }
}
```

#### POST /models
Create a new model
```bash
curl -X POST http://localhost:8000/models \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": 1,
    "model_name": "gpt-4-turbo",
    "model_version": "latest",
    "status": "pending"
  }'
```

**Request Body**:
```json
{
  "provider_id": 1,
  "model_name": "gpt-4-turbo",
  "model_version": "latest",
  "status": "pending",
  "metadata": {}
}
```

**Response**:
```json
{
  "success": true,
  "message": "Model created successfully",
  "data": {
    "id": 8
  }
}
```

#### PUT /models/:id
Update model details
```bash
curl -X PUT http://localhost:8000/models/1 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "running",
    "cpu_usage": 50.5
  }'
```

**Request Body**:
```json
{
  "status": "running",
  "cpu_usage": 50.5,
  "memory_usage": 60.2,
  "requests_handled": 200
}
```

**Response**:
```json
{
  "success": true,
  "message": "Model updated successfully"
}
```

#### DELETE /models/:id
Delete a model
```bash
curl -X DELETE http://localhost:8000/models/1
```

**Response**:
```json
{
  "success": true,
  "message": "Model deleted successfully"
}
```

#### GET /models/provider/:providerId
Get models by provider
```bash
curl http://localhost:8000/models/provider/1
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "model_name": "gpt-4",
      "status": "running"
    }
  ],
  "count": 2
}
```

---

### Agents API

#### GET /agents
Get all agents
```bash
curl http://localhost:8000/agents
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Master Agent",
      "type": "master",
      "persona_name": "AI Assistant",
      "status": "active",
      "request_count": 45,
      "active_sessions": 3,
      "created_at": "2024-01-24T10:00:00Z"
    }
  ],
  "count": 3
}
```

#### GET /agents/:id
Get specific agent
```bash
curl http://localhost:8000/agents/1
```

#### POST /agents
Create new agent
```bash
curl -X POST http://localhost:8000/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Custom Agent",
    "type": "chatbot",
    "persona_name": "Custom Bot"
  }'
```

#### PUT /agents/:id
Update agent
```bash
curl -X PUT http://localhost:8000/agents/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'
```

#### DELETE /agents/:id
Delete agent
```bash
curl -X DELETE http://localhost:8000/agents/1
```

---

### Providers API

#### GET /providers
Get all AI providers
```bash
curl http://localhost:8000/providers
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "OpenAI",
      "type": "openai",
      "api_endpoint": "https://api.openai.com/v1",
      "is_active": true,
      "created_at": "2024-01-24T10:00:00Z"
    }
  ],
  "count": 4
}
```

#### POST /providers
Create new provider
```bash
curl -X POST http://localhost:8000/providers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Custom Provider",
    "type": "custom",
    "api_endpoint": "http://custom-api.local"
  }'
```

---

### Chat API

#### GET /chat/conversations
Get all conversations
```bash
curl http://localhost:8000/chat/conversations
```

#### POST /chat/message
Send a chat message
```bash
curl -X POST http://localhost:8000/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": 1,
    "content": "Hello, how are you?",
    "agent_id": 1
  }'
```

#### WebSocket /chat
Real-time chat streaming
```javascript
const ws = new WebSocket('ws://localhost:8000/chat');
ws.onmessage = (event) => {
  console.log('Received:', event.data);
};
ws.send(JSON.stringify({
  type: 'message',
  content: 'Hello!',
  agent_id: 1
}));
```

---

### Memory API

#### GET /memory
Get memory records
```bash
curl http://localhost:8000/memory
```

#### POST /memory
Store memory
```bash
curl -X POST http://localhost:8000/memory \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": 1,
    "content_type": "conversation",
    "content": "Conversation context..."
  }'
```

#### GET /memory/:agentId
Get agent-specific memory
```bash
curl http://localhost:8000/memory/1
```

---

### Prompt Templates API

#### GET /prompt-templates
Get all prompt templates
```bash
curl http://localhost:8000/prompt-templates
```

#### POST /prompt-templates
Create new template
```bash
curl -X POST http://localhost:8000/prompt-templates \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $UAS_API_KEY" \
  -d '{
    "name": "Code Review",
    "description": "Review a code snippet",
    "template": "Review the following code: {{code}}",
    "variables": ["code"]
  }'
```

#### PUT /prompt-templates/:id
Update template
```bash
curl -X PUT http://localhost:8000/prompt-templates/1 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $UAS_API_KEY" \
  -d '{"template": "New content..."}'
```

#### DELETE /prompt-templates/:id
Delete template
```bash
curl -X DELETE http://localhost:8000/prompt-templates/1 -H "X-API-Key: $UAS_API_KEY"
```

---

### Load Balancer API

#### GET /loadbalancer/status
Get load balancer status
```bash
curl http://localhost:8000/loadbalancer/status
```

#### GET /loadbalancer/metrics
Get system metrics
```bash
curl http://localhost:8000/loadbalancer/metrics
```

**Response**:
```json
{
  "success": true,
  "data": {
    "cpu_usage": 35.2,
    "memory_usage": 48.5,
    "active_requests": 12,
    "total_requests": 1456
  }
}
```

---

### Editor Integration API

#### GET /editor/integrations
Get connected editors
```bash
curl http://localhost:8000/editor/integrations
```

#### POST /editor/send
Send command to editor
```bash
curl -X POST http://localhost:8000/editor/send \
  -H "Content-Type: application/json" \
  -d '{
    "editor_id": 1,
    "action": "create_file",
    "data": {
      "path": "test.ts",
      "content": "console.log(\"Hello\");"
    }
  }'
```

---

## Error Responses

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message",
  "message": "Detailed error explanation",
  "timestamp": "2024-01-24T10:30:00Z"
}
```

### Common HTTP Status Codes
- `200`: Success
- `201`: Created
- `400`: Bad request (invalid parameters)
- `404`: Not found
- `500`: Server error
- `503`: Service unavailable

---

## Rate Limiting

Currently, no rate limiting is implemented. It will be added in future versions.

---

## Pagination

Large result sets support pagination:

```bash
curl 'http://localhost:8000/models?page=1&limit=20'
```

**Parameters**:
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20, max: 100)

---

## Filtering & Sorting

Results can be filtered and sorted:

```bash
curl 'http://localhost:8000/models?status=running&sort_by=created_at&order=desc'
```

**Parameters**:
- `status`: Filter by status
- `sort_by`: Sort field
- `order`: asc (ascending) or desc (descending)

---

## Testing API Endpoints

### Using curl

```bash
# Test health
curl http://localhost:8000/health

# Get models
curl http://localhost:8000/models | jq

# Create model
curl -X POST http://localhost:8000/models \
  -H "Content-Type: application/json" \
  -d '{"provider_id":1,"model_name":"test"}'
```

### Using Postman

1. Import endpoints from this documentation
2. Set base URL to `http://localhost:8000`
3. Create requests for each endpoint
4. Test different HTTP methods (GET, POST, PUT, DELETE)

### Using Thunder Client (VS Code)

1. Install Thunder Client extension
2. Create collection
3. Add requests based on examples above
4. Run tests

---

## WebSocket Events

### Chat Events

```javascript
// Connection
ws.send(JSON.stringify({
  type: 'connect',
  session_id: 'session-123'
}));

// Send message
ws.send(JSON.stringify({
  type: 'message',
  content: 'Hello',
  agent_id: 1
}));

// Receive streaming response
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'stream') {
    console.log('Response chunk:', data.chunk);
  }
};
```

---

## Database Schema Reference

See `server/database/schema.sql` for complete database structure.

### Key Tables
- `ai_providers`: LLM provider configurations
- `ai_models`: Available models
- `agents`: Agent definitions
- `conversations`: Chat conversations
- `messages`: Chat messages
- `agent_memory`: Agent memory storage
- `prompt_templates`: Prompt templates
- `editor_integrations`: Editor connections

---

**API Version**: 1.0.0
**Last Updated**: January 2026
**Status**: Production Ready
