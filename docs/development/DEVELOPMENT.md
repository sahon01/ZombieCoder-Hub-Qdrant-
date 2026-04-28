# Development Guide

Complete development guidelines and best practices for the UAS Admin Panel.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [Code Standards](#code-standards)
4. [Component Development](#component-development)
5. [API Development](#api-development)
6. [Testing Guidelines](#testing-guidelines)
7. [Debugging](#debugging)
8. [Performance Optimization](#performance-optimization)

---

## Getting Started

### Development Environment Setup

\`\`\`bash
# 1. Clone repository
git clone <repository-url>
cd uas-admin-panel

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your configuration

# 4. Start development server
npm run dev

# 5. Open browser
# Navigate to http://localhost:3000
\`\`\`

### Required Tools

- **Node.js**: v18.x or higher
- **npm**: v9.x or higher
- **VS Code**: Recommended IDE
- **Git**: Version control

### Recommended VS Code Extensions

\`\`\`json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "formulahendry.auto-rename-tag",
    "christian-kohler.path-intellisense"
  ]
}
\`\`\`

---

## Development Workflow

### Branch Strategy

\`\`\`
main                    # Production-ready code
├── develop            # Development branch
    ├── feature/*      # New features
    ├── bugfix/*       # Bug fixes
    ├── hotfix/*       # Urgent fixes
    └── refactor/*     # Code refactoring
\`\`\`

### Commit Convention

Follow conventional commits:

\`\`\`bash
# Format
<type>(<scope>): <subject>

# Types
feat:     # New feature
fix:      # Bug fix
docs:     # Documentation
style:    # Formatting
refactor: # Code restructuring
test:     # Adding tests
chore:    # Maintenance

# Examples
feat(agents): add multi-agent orchestration
fix(dashboard): resolve server status display bug
docs(api): update endpoint documentation
\`\`\`

### Pull Request Process

1. Create feature branch from `develop`
2. Implement changes with tests
3. Run linting and tests: `npm run lint && npm test`
4. Create PR with description
5. Request code review
6. Address feedback
7. Merge after approval

---

## Code Standards

### TypeScript Guidelines

\`\`\`typescript
// ✅ DO: Use explicit types
interface AgentConfig {
  id: string;
  name: string;
  endpoint: string;
  enabled: boolean;
}

function configureAgent(config: AgentConfig): void {
  // Implementation
}

// ❌ DON'T: Use 'any' type
function configureAgent(config: any) {
  // Avoid this
}

// ✅ DO: Use type guards
function isAgent(obj: unknown): obj is Agent {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj
  );
}

// ✅ DO: Use enums for constants
enum AgentStatus {
  Active = 'active',
  Inactive = 'inactive',
  Error = 'error',
}
\`\`\`

### React Component Guidelines

\`\`\`typescript
// ✅ DO: Use functional components with TypeScript
interface AgentCardProps {
  agent: Agent;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
}

export function AgentCard({ agent, onStart, onStop }: AgentCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{agent.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <Button onClick={() => onStart(agent.id)}>Start</Button>
        <Button onClick={() => onStop(agent.id)}>Stop</Button>
      </CardContent>
    </Card>
  );
}

// ✅ DO: Use custom hooks for logic
function useAgentStatus(agentId: string) {
  const { data, error } = useSWR(
    `/api/agents/${agentId}/status`,
    fetcher,
    { refreshInterval: 5000 }
  );
  
  return {
    status: data?.status,
    isLoading: !error && !data,
    isError: error,
  };
}

// ✅ DO: Memoize expensive computations
const sortedAgents = useMemo(() => {
  return agents.sort((a, b) => a.priority - b.priority);
}, [agents]);
\`\`\`

### File Naming Conventions

\`\`\`
components/
├── agent-card.tsx           # kebab-case for files
├── agent-list.tsx
└── multi-agent-workstation.tsx

types/
├── agent.ts                 # lowercase for types
├── config.ts
└── monitoring.ts

lib/
├── api-client.ts            # kebab-case for utilities
└── config-loader.ts
\`\`\`

### Import Organization

\`\`\`typescript
// 1. External imports
import { useState, useEffect } from 'react';
import { Card, CardHeader } from '@/components/ui/card';

// 2. Internal imports - absolute paths
import { Agent } from '@/types/agent';
import { useAgents } from '@/hooks/use-agents';
import { AgentCard } from '@/components/agents/agent-card';

// 3. Relative imports (avoid when possible)
import { helper } from './helper';

// 4. Styles
import './styles.css';
\`\`\`

---

## Component Development

### Component Structure

\`\`\`typescript
// components/agents/agent-card.tsx

'use client'; // If client component

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Agent } from '@/types/agent';

// 1. Type definitions
interface AgentCardProps {
  agent: Agent;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
}

// 2. Component
export function AgentCard({ agent, onStart, onStop }: AgentCardProps) {
  // 3. Hooks
  const [isLoading, setIsLoading] = useState(false);
  
  // 4. Event handlers
  const handleStart = async () => {
    setIsLoading(true);
    try {
      await onStart(agent.id);
    } finally {
      setIsLoading(false);
    }
  };
  
  // 5. Render
  return (
    <Card>
      <CardHeader>
        <CardTitle>{agent.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button 
            onClick={handleStart} 
            disabled={isLoading}
          >
            Start
          </Button>
          <Button 
            onClick={() => onStop(agent.id)}
            variant="destructive"
          >
            Stop
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
\`\`\`

### Custom Hooks

\`\`\`typescript
// hooks/use-agents.ts

import useSWR from 'swr';
import { Agent } from '@/types/agent';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useAgents() {
  const { data, error, mutate } = useSWR<Agent[]>(
    '/api/agents/list',
    fetcher,
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
    }
  );
  
  const startAgent = async (id: string) => {
    await fetch(`/api/agents/${id}/start`, { method: 'POST' });
    mutate(); // Revalidate data
  };
  
  const stopAgent = async (id: string) => {
    await fetch(`/api/agents/${id}/stop`, { method: 'POST' });
    mutate();
  };
  
  return {
    agents: data,
    isLoading: !error && !data,
    isError: error,
    startAgent,
    stopAgent,
    refresh: mutate,
  };
}
\`\`\`

### Context Providers

\`\`\`typescript
// lib/providers/config-provider.tsx

'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { Config } from '@/types/config';

interface ConfigContextType {
  config: Config | null;
  isLoading: boolean;
  error: Error | null;
  reloadConfig: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType | null>(null);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/config/load');
      const data = await response.json();
      setConfig(data);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    loadConfig();
  }, []);
  
  return (
    <ConfigContext.Provider 
      value={{ 
        config, 
        isLoading, 
        error, 
        reloadConfig: loadConfig 
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within ConfigProvider');
  }
  return context;
}
\`\`\`

---

## API Development

### API Route Structure

\`\`\`typescript
// app/api/agents/[id]/start/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// 1. Validation schema
const startAgentSchema = z.object({
  id: z.string().uuid(),
});

// 2. POST handler
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 3. Authenticate
    const apiKey = request.headers.get('X-API-Key');
    if (!validateApiKey(apiKey)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // 4. Validate input
    const validated = startAgentSchema.parse({ id: params.id });
    
    // 5. Business logic
    const result = await startAgent(validated.id);
    
    // 6. Return response
    return NextResponse.json(result);
    
  } catch (error) {
    // 7. Error handling
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Error starting agent:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
\`\`\`

### Server Actions

\`\`\`typescript
// app/actions/agent-actions.ts

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const startAgentSchema = z.object({
  id: z.string().uuid(),
});

export async function startAgentAction(formData: FormData) {
  try {
    // Validate
    const validated = startAgentSchema.parse({
      id: formData.get('id'),
    });
    
    // Execute
    const response = await fetch(
      `${process.env.UAS_API_URL}/agents/${validated.id}/start`,
      {
        method: 'POST',
        headers: {
          'X-API-Key': process.env.UAS_API_KEY!,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to start agent');
    }
    
    // Revalidate
    revalidatePath('/agents');
    
    return { success: true };
    
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
\`\`\`

### API Client

\`\`\`typescript
// lib/api/client.ts

class APIClient {
  private baseUrl: string;
  private apiKey: string;
  
  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    this.apiKey = process.env.UAS_API_KEY || '';
  }
  
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        ...options?.headers,
      },
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  async getAgents() {
    return this.request<Agent[]>('/api/agents/list');
  }
  
  async startAgent(id: string) {
    return this.request(`/api/agents/${id}/start`, {
      method: 'POST',
    });
  }
}

export const apiClient = new APIClient();
\`\`\`

---

## Testing Guidelines

### Unit Testing

\`\`\`typescript
// __tests__/components/agent-card.test.tsx

import { render, screen, fireEvent } from '@testing-library/react';
import { AgentCard } from '@/components/agents/agent-card';

describe('AgentCard', () => {
  const mockAgent = {
    id: '123',
    name: 'Test Agent',
    status: 'active',
  };
  
  it('renders agent name', () => {
    render(
      <AgentCard 
        agent={mockAgent} 
        onStart={jest.fn()} 
        onStop={jest.fn()} 
      />
    );
    
    expect(screen.getByText('Test Agent')).toBeInTheDocument();
  });
  
  it('calls onStart when start button clicked', () => {
    const onStart = jest.fn();
    
    render(
      <AgentCard 
        agent={mockAgent} 
        onStart={onStart} 
        onStop={jest.fn()} 
      />
    );
    
    fireEvent.click(screen.getByText('Start'));
    expect(onStart).toHaveBeenCalledWith('123');
  });
});
\`\`\`

### Integration Testing

\`\`\`typescript
// __tests__/api/agents.test.ts

import { POST } from '@/app/api/agents/[id]/start/route';
import { NextRequest } from 'next/server';

describe('/api/agents/[id]/start', () => {
  it('starts agent successfully', async () => {
    const request = new NextRequest('http://localhost:3000/api/agents/123/start', {
      method: 'POST',
      headers: {
        'X-API-Key': 'test-key',
      },
    });
    
    const response = await POST(request, { params: { id: '123' } });
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
\`\`\`

---

## Debugging

### Debug Logging

\`\`\`typescript
// lib/logger.ts

export const logger = {
  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG] ${message}`, data);
    }
  },
  
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${message}`, data);
  },
  
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${message}`, error);
  },
};
\`\`\`

### VS Code Debug Configuration

\`\`\`json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node-terminal",
      "request": "launch",
      "command": "npm run dev"
    },
    {
      "name": "Next.js: debug client-side",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:3000"
    }
  ]
}
\`\`\`

---

## Performance Optimization

### Code Splitting

\`\`\`typescript
// Dynamic imports for large components
import dynamic from 'next/dynamic';

const MultiAgentWorkstation = dynamic(
  () => import('@/components/agents/multi-agent-workstation'),
  { loading: () => <LoadingSpinner /> }
);
\`\`\`

### Memoization

\`\`\`typescript
// Memoize expensive computations
const sortedAgents = useMemo(() => {
  return agents.sort((a, b) => a.priority - b.priority);
}, [agents]);

// Memoize callbacks
const handleStart = useCallback((id: string) => {
  startAgent(id);
}, [startAgent]);
\`\`\`

### Image Optimization

\`\`\`typescript
import Image from 'next/image';

<Image
  src="/logo.png"
  alt="Logo"
  width={200}
  height={100}
  priority // For above-the-fold images
/>
\`\`\`

---

For testing procedures, see [TESTING.md](./TESTING.md).
