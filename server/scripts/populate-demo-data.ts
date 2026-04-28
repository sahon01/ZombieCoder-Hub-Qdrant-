import { initializeDatabase, executeQuery, closeDatabase } from '../src/database/connection';
import { Logger } from '../src/utils/logger';
import dotenv from 'dotenv';

dotenv.config();

const logger = new Logger();

async function populateDemoData() {
    try {
        logger.info('Starting demo data population...');

        // Initialize database
        await initializeDatabase({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'uas_admin',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        // Clear existing data (optional - only in development)
        if (process.env.NODE_ENV === 'development') {
            logger.info('Clearing existing data...');
            await executeQuery('SET FOREIGN_KEY_CHECKS = 0');
            await executeQuery('TRUNCATE TABLE api_audit_logs');
            await executeQuery('TRUNCATE TABLE messages');
            await executeQuery('TRUNCATE TABLE conversations');
            await executeQuery('TRUNCATE TABLE agent_memory');
            await executeQuery('TRUNCATE TABLE prompt_templates');
            await executeQuery('TRUNCATE TABLE editor_integrations');
            await executeQuery('TRUNCATE TABLE ai_models');
            await executeQuery('TRUNCATE TABLE agents');
            await executeQuery('TRUNCATE TABLE ai_providers');
            await executeQuery('TRUNCATE TABLE system_settings');
            await executeQuery('SET FOREIGN_KEY_CHECKS = 1');
        }

        // =====================================================
        // 1. Populate AI Providers
        // =====================================================
        logger.info('Populating AI Providers...');
        const providers = [
            {
                name: 'Ollama Local',
                type: 'ollama',
                endpoint: 'http://localhost:11434',
                config: { local: true, priority: 1 }
            },
            {
                name: 'OpenAI',
                type: 'openai',
                endpoint: 'https://api.openai.com/v1',
                config: { organization: 'demo', priority: 2 }
            },
            {
                name: 'Google AI',
                type: 'google',
                endpoint: 'https://generativelanguage.googleapis.com',
                config: { region: 'us-central1', priority: 3 }
            },
            {
                name: 'Llama.cpp Server',
                type: 'llama_cpp',
                endpoint: 'http://localhost:8001',
                config: { local: true, priority: 4 }
            }
        ];

        const providerIds = [];
        for (const provider of providers) {
            await executeQuery(
                `INSERT INTO ai_providers (name, type, api_endpoint, config_json, is_active) 
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    provider.name,
                    provider.type,
                    provider.endpoint,
                    JSON.stringify(provider.config),
                    true
                ]
            );
            const result = await executeQuery('SELECT LAST_INSERT_ID() as id');
            providerIds.push(result[0].id);
        }
        logger.info(`Populated ${providers.length} providers`);

        // =====================================================
        // 2. Populate AI Models
        // =====================================================
        logger.info('Populating AI Models...');
        const models = [
            { providerId: providerIds[0], name: 'llama2', version: '7b', status: 'running' },
            { providerId: providerIds[0], name: 'mistral', version: 'latest', status: 'stopped' },
            { providerId: providerIds[0], name: 'neural-chat', version: '7b', status: 'running' },
            { providerId: providerIds[1], name: 'gpt-4', version: '1106-preview', status: 'running' },
            { providerId: providerIds[1], name: 'gpt-3.5-turbo', version: 'latest', status: 'running' },
            { providerId: providerIds[2], name: 'ZombieCoder-pro', version: 'latest', status: 'running' },
            { providerId: providerIds[3], name: 'orca-mini', version: '3b', status: 'stopped' }
        ];

        for (const model of models) {
            await executeQuery(
                `INSERT INTO ai_models 
                 (provider_id, model_name, model_version, status, cpu_usage, memory_usage, requests_handled, metadata) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    model.providerId,
                    model.name,
                    model.version,
                    model.status,
                    Math.random() * 80,
                    Math.random() * 60,
                    Math.floor(Math.random() * 1000),
                    JSON.stringify({ lastCheck: new Date().toISOString(), version: model.version })
                ]
            );
        }
        logger.info(`Populated ${models.length} models`);

        // =====================================================
        // 3. Populate Agents
        // =====================================================
        logger.info('Populating Agents...');
        const agents = [
            {
                name: 'Editor Agent',
                type: 'editor',
                persona: 'Code Assistant',
                description: 'Specialized agent for code-related tasks with LSP/DAP integration',
                config: { tools: ['code_exec', 'lsp', 'dap'], language: 'multi' }
            },
            {
                name: 'Master Agent',
                type: 'master',
                persona: 'AI Assistant',
                description: 'Primary conversational agent for general queries and task routing',
                config: { tools: ['search', 'reasoning', 'planning'], language: 'multi' }
            },
            {
                name: 'Chat Bot',
                type: 'chatbot',
                persona: 'Knowledge Bot',
                description: 'Q&A focused agent leveraging knowledge retrieval',
                config: { tools: ['knowledge_base', 'qa', 'summarization'], language: 'multi' }
            }
        ];

        const agentIds = [];
        for (const agent of agents) {
            await executeQuery(
                `INSERT INTO agents (name, type, persona_name, description, status, config, metadata) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    agent.name,
                    agent.type,
                    agent.persona,
                    agent.description,
                    'active',
                    JSON.stringify(agent.config),
                    JSON.stringify({ version: '1.0', created: new Date().toISOString() })
                ]
            );
            const result = await executeQuery('SELECT LAST_INSERT_ID() as id');
            agentIds.push(result[0].id);
        }
        logger.info(`Populated ${agents.length} agents`);

        // =====================================================
        // 4. Populate Agent Memory
        // =====================================================
        logger.info('Populating Agent Memory...');
        for (const agentId of agentIds) {
            await executeQuery(
                `INSERT INTO agent_memory (agent_id, content_type, content, metadata, is_cached) 
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    agentId,
                    'conversation',
                    'Sample conversation context for agent initialization',
                    JSON.stringify({ sessionId: `session-${agentId}`, timestamp: new Date().toISOString() }),
                    false
                ]
            );
        }
        logger.info('Populated agent memory records');

        // =====================================================
        // 5. Populate Conversations
        // =====================================================
        logger.info('Populating Conversations...');
        const conversationIds = [];
        for (let i = 0; i < 3; i++) {
            const sessionUuid = `session-${Date.now()}-${i}`;
            await executeQuery(
                `INSERT INTO conversations (title, agent_id, session_uuid, project_config, metadata) 
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    `Sample Conversation ${i + 1}`,
                    agentIds[i % agentIds.length],
                    sessionUuid,
                    JSON.stringify({ model: 'gpt-4', temperature: 0.7 }),
                    JSON.stringify({ tags: ['demo', 'sample'] })
                ]
            );
            const result = await executeQuery('SELECT LAST_INSERT_ID() as id');
            conversationIds.push(result[0].id);
        }
        logger.info(`Populated ${conversationIds.length} conversations`);

        // =====================================================
        // 6. Populate Messages
        // =====================================================
        logger.info('Populating Messages...');
        const messages = [
            { conversationId: conversationIds[0], senderType: 'user', content: 'Hello, can you help me with coding?' },
            { conversationId: conversationIds[0], senderType: 'agent', content: 'Of course! I can help you with coding tasks. What would you like to work on?' },
            { conversationId: conversationIds[1], senderType: 'user', content: 'What is React?' },
            { conversationId: conversationIds[1], senderType: 'agent', content: 'React is a JavaScript library for building user interfaces with components.' },
            { conversationId: conversationIds[2], senderType: 'user', content: 'Show me a TypeScript example' },
            { conversationId: conversationIds[2], senderType: 'agent', content: 'Here is a simple TypeScript example: interface User { name: string; age: number; }' }
        ];

        for (const message of messages) {
            await executeQuery(
                `INSERT INTO messages (conversation_id, sender_type, model_used, content, response_metadata, token_usage, latency_ms) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    message.conversationId,
                    message.senderType,
                    message.senderType === 'agent' ? 'gpt-4' : null,
                    message.content,
                    JSON.stringify({ language: 'en', confidence: 0.95 }),
                    Math.floor(Math.random() * 500),
                    Math.floor(Math.random() * 2000)
                ]
            );
        }
        logger.info(`Populated ${messages.length} messages`);

        // =====================================================
        // 7. Populate Prompt Templates
        // =====================================================
        logger.info('Populating Prompt Templates...');
        const templates = [
            {
                name: 'Code Review Template',
                description: 'Template for code review assistance',
                content: 'Please review the following code and provide feedback: {{code}}',
                variables: ['code'],
                agentId: agentIds[0]
            },
            {
                name: 'General Q&A Template',
                description: 'Template for general questions',
                content: 'Answer the following question: {{question}}',
                variables: ['question'],
                agentId: agentIds[1]
            },
            {
                name: 'Documentation Template',
                description: 'Template for generating documentation',
                content: 'Generate documentation for: {{topic}}',
                variables: ['topic'],
                agentId: agentIds[2]
            }
        ];

        for (const template of templates) {
            await executeQuery(
                `INSERT INTO prompt_templates (name, description, template_content, variables, agent_id, is_active) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    template.name,
                    template.description,
                    template.content,
                    JSON.stringify(template.variables),
                    template.agentId,
                    true
                ]
            );
        }
        logger.info(`Populated ${templates.length} prompt templates`);

        // =====================================================
        // 8. Populate Editor Integrations
        // =====================================================
        logger.info('Populating Editor Integrations...');
        const integrations = [
            {
                name: 'VS Code Local',
                type: 'vscode',
                url: 'ws://localhost:9000',
                lspPort: 9001,
                dapPort: 9002,
                connected: true
            },
            {
                name: 'Cursor AI Editor',
                type: 'cursor',
                url: 'ws://localhost:9003',
                lspPort: 9004,
                dapPort: 9005,
                connected: false
            },
            {
                name: 'JetBrains IDE',
                type: 'jetbrains',
                url: 'ws://localhost:9006',
                lspPort: 9007,
                dapPort: 9008,
                connected: true
            }
        ];

        for (const integration of integrations) {
            await executeQuery(
                `INSERT INTO editor_integrations (name, editor_type, connection_url, lsp_port, dap_port, is_connected, metadata) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    integration.name,
                    integration.type,
                    integration.url,
                    integration.lspPort,
                    integration.dapPort,
                    integration.connected,
                    JSON.stringify({ protocol: 'LSP/DAP', version: '3.17' })
                ]
            );
        }
        logger.info(`Populated ${integrations.length} editor integrations`);

        // =====================================================
        // 9. Populate System Settings
        // =====================================================
        logger.info('Populating System Settings...');
        const settings = [
            { key: 'default_model', value: 'gpt-4', type: 'string' },
            { key: 'default_provider', value: 'openai', type: 'string' },
            { key: 'max_token_limit', value: '2000', type: 'integer' },
            { key: 'enable_streaming', value: 'true', type: 'boolean' },
            { key: 'cache_enabled', value: 'true', type: 'boolean' },
            { key: 'log_level', value: 'info', type: 'string' }
        ];

        for (const setting of settings) {
            await executeQuery(
                `INSERT INTO system_settings (setting_key, setting_value, setting_type) 
                 VALUES (?, ?, ?)`,
                [setting.key, setting.value, setting.type]
            );
        }
        logger.info(`Populated ${settings.length} system settings`);

        logger.info('Demo data population completed successfully!');
    } catch (error) {
        logger.error('Error populating demo data:', error);
        process.exit(1);
    } finally {
        await closeDatabase();
    }
}

// Run the population script
populateDemoData();
