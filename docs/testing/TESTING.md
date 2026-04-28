# Testing Documentation

Comprehensive testing guide for the UAS Admin Panel.

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [Unit Testing](#unit-testing)
3. [Integration Testing](#integration-testing)
4. [End-to-End Testing](#end-to-end-testing)
5. [API Testing](#api-testing)
6. [Performance Testing](#performance-testing)
7. [Manual Testing Checklist](#manual-testing-checklist)

---

## Testing Strategy

### Testing Pyramid

\`\`\`
        /\
       /  \      E2E Tests (10%)
      /____\     
     /      \    Integration Tests (30%)
    /________\   
   /          \  Unit Tests (60%)
  /__________  \
\`\`\`

### Test Coverage Goals

- **Unit Tests**: 80% coverage
- **Integration Tests**: Key user flows
- **E2E Tests**: Critical paths
- **API Tests**: All endpoints

---

## Unit Testing

### Setup

\`\`\`bash
# Install testing dependencies
npm install --save-dev jest @testing-library/react @testing-library/jest-dom @testing-library/user-event
\`\`\`

### Component Testing

\`\`\`typescript
// __tests__/components/agent-card.test.tsx

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentCard } from '@/components/agents/agent-card';

describe('AgentCard Component', () => {
  const mockAgent = {
    id: 'agent-001',
    name: 'Test Agent',
    status: 'active',
    endpoint: 'http://localhost:5001',
  };
  
  const mockOnStart = jest.fn();
  const mockOnStop = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('renders agent information correctly', () => {
    render(
      <AgentCard 
        agent={mockAgent} 
        onStart={mockOnStart} 
        onStop={mockOnStop} 
      />
    );
    
    expect(screen.getByText('Test Agent')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });
  
  it('calls onStart when start button is clicked', async () => {
    render(
      <AgentCard 
        agent={mockAgent} 
        onStart={mockOnStart} 
        onStop={mockOnStop} 
      />
    );
    
    const startButton = screen.getByRole('button', { name: /start/i });
    fireEvent.click(startButton);
    
    await waitFor(() => {
      expect(mockOnStart).toHaveBeenCalledWith('agent-001');
    });
  });
  
  it('disables buttons while loading', async () => {
    render(
      <AgentCard 
        agent={mockAgent} 
        onStart={mockOnStart} 
        onStop={mockOnStop} 
      />
    );
    
    const startButton = screen.getByRole('button', { name: /start/i });
    fireEvent.click(startButton);
    
    expect(startButton).toBeDisabled();
  });
});
\`\`\`

### Hook Testing

\`\`\`typescript
// __tests__/hooks/use-agents.test.ts

import { renderHook, waitFor } from '@testing-library/react';
import { useAgents } from '@/hooks/use-agents';

// Mock SWR
jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('useAgents Hook', () => {
  it('returns agents data', async () => {
    const mockAgents = [
      { id: 'agent-001', name: 'Agent 1' },
      { id: 'agent-002', name: 'Agent 2' },
    ];
    
    (useSWR as jest.Mock).mockReturnValue({
      data: mockAgents,
      error: null,
      mutate: jest.fn(),
    });
    
    const { result } = renderHook(() => useAgents());
    
    await waitFor(() => {
      expect(result.current.agents).toEqual(mockAgents);
      expect(result.current.isLoading).toBe(false);
    });
  });
  
  it('handles error state', async () => {
    const mockError = new Error('Failed to fetch');
    
    (useSWR as jest.Mock).mockReturnValue({
      data: null,
      error: mockError,
      mutate: jest.fn(),
    });
    
    const { result } = renderHook(() => useAgents());
    
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
\`\`\`

### Utility Function Testing

\`\`\`typescript
// __tests__/lib/config-loader.test.ts

import { loadConfig, validateConfig } from '@/lib/config/loader';

describe('Config Loader', () => {
  it('loads configuration successfully', async () => {
    const config = await loadConfig();
    
    expect(config).toHaveProperty('servers');
    expect(config).toHaveProperty('features');
  });
  
  it('validates configuration correctly', () => {
    const validConfig = {
      UAS_API_URL: 'http://localhost:8000',
      UAS_API_KEY: 'test-key',
    };
    
    const result = validateConfig(validConfig);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  
  it('detects invalid configuration', () => {
    const invalidConfig = {
      UAS_API_URL: 'invalid-url',
    };
    
    const result = validateConfig(invalidConfig);
    
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
\`\`\`

### Running Unit Tests

\`\`\`bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test agent-card.test.tsx
\`\`\`

---

## Integration Testing

### API Route Testing

\`\`\`typescript
// __tests__/integration/api/agents.test.ts

import { POST } from '@/app/api/agents/[id]/start/route';
import { NextRequest } from 'next/server';

describe('Agent API Integration', () => {
  it('starts agent successfully with valid request', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/agents/agent-001/start',
      {
        method: 'POST',
        headers: {
          'X-API-Key': process.env.UAS_API_KEY!,
        },
      }
    );
    
    const response = await POST(request, { 
      params: { id: 'agent-001' } 
    });
    
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.agentId).toBe('agent-001');
  });
  
  it('returns 401 for missing API key', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/agents/agent-001/start',
      { method: 'POST' }
    );
    
    const response = await POST(request, { 
      params: { id: 'agent-001' } 
    });
    
    expect(response.status).toBe(401);
  });
  
  it('returns 400 for invalid agent ID', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/agents/invalid-id/start',
      {
        method: 'POST',
        headers: {
          'X-API-Key': process.env.UAS_API_KEY!,
        },
      }
    );
    
    const response = await POST(request, { 
      params: { id: 'invalid-id' } 
    });
    
    expect(response.status).toBe(400);
  });
});
\`\`\`

### Database Integration Testing

\`\`\`typescript
// __tests__/integration/database.test.ts

import { storeMemory, retrieveMemory } from '@/lib/memory-agent';

describe('Memory Agent Integration', () => {
  beforeAll(async () => {
    // Setup test database
    await setupTestDatabase();
  });
  
  afterAll(async () => {
    // Cleanup test database
    await cleanupTestDatabase();
  });
  
  it('stores and retrieves data correctly', async () => {
    const testData = {
      key: 'test-key',
      value: { message: 'Hello World' },
    };
    
    await storeMemory(testData.key, testData.value);
    const retrieved = await retrieveMemory(testData.key);
    
    expect(retrieved).toEqual(testData.value);
  });
});
\`\`\`

---

## End-to-End Testing

### Setup Playwright

\`\`\`bash
npm install --save-dev @playwright/test
npx playwright install
\`\`\`

### E2E Test Example

\`\`\`typescript
// e2e/agent-management.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Agent Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
  });
  
  test('should display agent list', async ({ page }) => {
    await page.goto('/agents');
    
    await expect(page.locator('h1')).toContainText('Agents');
    await expect(page.locator('[data-testid="agent-card"]')).toHaveCount(3);
  });
  
  test('should start an agent', async ({ page }) => {
    await page.goto('/agents');
    
    const firstAgent = page.locator('[data-testid="agent-card"]').first();
    await firstAgent.locator('button:has-text("Start")').click();
    
    await expect(firstAgent.locator('[data-status="active"]')).toBeVisible();
  });
  
  test('should navigate to agent details', async ({ page }) => {
    await page.goto('/agents');
    
    await page.locator('[data-testid="agent-card"]').first().click();
    
    await expect(page).toHaveURL(/\/agents\/agent-\d+/);
    await expect(page.locator('h1')).toContainText('Agent Details');
  });
});
\`\`\`

### Running E2E Tests

\`\`\`bash
# Run all E2E tests
npx playwright test

# Run in headed mode
npx playwright test --headed

# Run specific test
npx playwright test agent-management.spec.ts

# Generate test report
npx playwright show-report
\`\`\`

---

## API Testing

### Using REST Client

Create `.http` files for API testing:

\`\`\`http
### Load Configuration
GET http://localhost:3000/api/config/load
X-API-Key: {{apiKey}}

### List Agents
GET http://localhost:3000/api/agents/list
X-API-Key: {{apiKey}}

### Start Agent
POST http://localhost:3000/api/agents/agent-001/start
X-API-Key: {{apiKey}}
Content-Type: application/json

### Get Metrics
GET http://localhost:3000/api/monitoring/metrics?timeRange=1h
X-API-Key: {{apiKey}}
\`\`\`

### Automated API Testing

\`\`\`typescript
// __tests__/api/endpoints.test.ts

describe('API Endpoints', () => {
  const apiKey = process.env.UAS_API_KEY;
  const baseUrl = 'http://localhost:3000';
  
  test('GET /api/config/load returns configuration', async () => {
    const response = await fetch(`${baseUrl}/api/config/load`, {
      headers: { 'X-API-Key': apiKey! },
    });
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('servers');
    expect(data).toHaveProperty('features');
  });
  
  test('GET /api/agents/list returns agent list', async () => {
    const response = await fetch(`${baseUrl}/api/agents/list`, {
      headers: { 'X-API-Key': apiKey! },
    });
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(Array.isArray(data.agents)).toBe(true);
  });
});
\`\`\`

---

## Performance Testing

### Load Testing with k6

\`\`\`javascript
// load-tests/agent-api.js

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp up
    { duration: '1m', target: 20 },   // Stay at 20 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
};

export default function () {
  const response = http.get('http://localhost:3000/api/agents/list', {
    headers: { 'X-API-Key': __ENV.API_KEY },
  });
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
}
\`\`\`

Run load test:
\`\`\`bash
k6 run load-tests/agent-api.js
\`\`\`

### Performance Benchmarks

\`\`\`typescript
// __tests__/performance/benchmarks.test.ts

import { performance } from 'perf_hooks';

describe('Performance Benchmarks', () => {
  it('loads configuration in under 100ms', async () => {
    const start = performance.now();
    await loadConfig();
    const end = performance.now();
    
    expect(end - start).toBeLessThan(100);
  });
  
  it('processes 100 agent requests in under 5 seconds', async () => {
    const start = performance.now();
    
    const promises = Array.from({ length: 100 }, () => 
      callAgent('agent-001', { action: 'test' })
    );
    
    await Promise.all(promises);
    
    const end = performance.now();
    expect(end - start).toBeLessThan(5000);
  });
});
\`\`\`

---

## Manual Testing Checklist

### Configuration Testing

- [ ] Load configuration from `.env.local`
- [ ] Validate all required environment variables
- [ ] Test server connectivity checks
- [ ] Verify feature activation based on server status
- [ ] Update configuration and verify changes

### Agent Management Testing

- [ ] List all agents
- [ ] View agent details
- [ ] Start an agent
- [ ] Stop an agent
- [ ] Call agent with payload
- [ ] View agent metrics
- [ ] Test multi-agent orchestration

### Monitoring Testing

- [ ] View real-time metrics dashboard
- [ ] Check CPU and memory usage
- [ ] View request statistics
- [ ] Access system logs
- [ ] Filter logs by level
- [ ] Test WebSocket real-time updates

### VS Code Integration Testing

- [ ] Execute command in VS Code
- [ ] Sync file to VS Code
- [ ] Get workspace information
- [ ] Test file operations
- [ ] Verify security confirmations

### Load Balancer Testing

- [ ] View instance status
- [ ] Route requests through load balancer
- [ ] Test different balancing strategies
- [ ] Verify failover behavior
- [ ] Check health checks

### Memory Agent Testing

- [ ] Store data
- [ ] Retrieve data
- [ ] Search memory
- [ ] Delete data
- [ ] Test TTL expiration

### UI/UX Testing

- [ ] Responsive design on mobile
- [ ] Responsive design on tablet
- [ ] Responsive design on desktop
- [ ] Dark mode (if applicable)
- [ ] Accessibility (keyboard navigation)
- [ ] Screen reader compatibility
- [ ] Loading states
- [ ] Error states
- [ ] Empty states

### Security Testing

- [ ] API key authentication
- [ ] Rate limiting
- [ ] CORS protection
- [ ] Input validation
- [ ] XSS prevention
- [ ] CSRF protection

---

## Test Scripts

Add to `package.json`:

\`\`\`json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:e2e": "playwright test",
    "test:api": "jest --testPathPattern=api",
    "test:integration": "jest --testPathPattern=integration",
    "test:all": "npm run test && npm run test:e2e"
  }
}
\`\`\`

---

## Continuous Integration

### GitHub Actions Example

\`\`\`yaml
# .github/workflows/test.yml

name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm test -- --coverage
      
      - name: Run E2E tests
        run: npx playwright test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
\`\`\`

---

## Best Practices

1. **Write tests first** (TDD approach when possible)
2. **Keep tests isolated** - No dependencies between tests
3. **Use descriptive test names** - Clearly state what is being tested
4. **Test edge cases** - Not just happy paths
5. **Mock external dependencies** - Keep tests fast and reliable
6. **Maintain test coverage** - Aim for 80%+ coverage
7. **Run tests before commits** - Use pre-commit hooks
8. **Review test failures** - Don't ignore failing tests

---

For development guidelines, see [DEVELOPMENT.md](./DEVELOPMENT.md).
