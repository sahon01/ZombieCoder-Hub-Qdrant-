import { initializeDatabase, executeQuery } from '../src/database/connection';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

function requireEnv(name: string): string {
  const v = (process.env[name] || '').trim();
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

async function populateModels() {
  try {
    // Initialize database connection using environment variables
    const config = {
      host: process.env.DB_HOST || 'localhost',
      user: requireEnv('DB_USER'),
      password: requireEnv('DB_PASSWORD'),
      database: process.env.DB_NAME || 'uas_admin',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };

    await initializeDatabase(config);
    console.log('Database connection initialized');

    const providerName = (process.env.OLLAMA_PROVIDER_NAME || 'Ollama Local').trim();
    const providerEndpoint = (process.env.OLLAMA_URL || 'http://localhost:11434').trim();

    // Ensure provider exists (idempotent)
    await executeQuery(
      `INSERT INTO ai_providers (name, type, api_endpoint, is_active)
       VALUES (?, 'ollama', ?, TRUE)
       ON DUPLICATE KEY UPDATE
         type = VALUES(type),
         api_endpoint = VALUES(api_endpoint),
         is_active = VALUES(is_active),
         updated_at = CURRENT_TIMESTAMP`,
      [providerName, providerEndpoint]
    );

    const providers: any[] = await executeQuery(
      `SELECT id FROM ai_providers WHERE name = ? LIMIT 1`,
      [providerName]
    );
    if (!Array.isArray(providers) || providers.length === 0) {
      throw new Error('Failed to resolve provider id after upsert');
    }

    const providerId = providers[0].id;
    console.log(`Provider ready: ${providerName} (ID: ${providerId})`);

    const modelName = (process.env.OLLAMA_DEFAULT_MODEL || 'qwen2.5-coder:1.5b').trim();
    const modelVersion = (process.env.OLLAMA_DEFAULT_MODEL_VERSION || '1.5b').trim();

    const modelMetadata = {
      family: process.env.OLLAMA_DEFAULT_MODEL_FAMILY || 'qwen2.5',
      parameter_size: modelVersion,
      quantization_level: process.env.OLLAMA_DEFAULT_MODEL_QUANT || null,
      size: process.env.OLLAMA_DEFAULT_MODEL_SIZE ? Number(process.env.OLLAMA_DEFAULT_MODEL_SIZE) : null
    };

    const result: any = await executeQuery(
      `INSERT INTO ai_models (provider_id, model_name, model_version, status, cpu_usage, memory_usage, requests_handled, last_response_time, total_tokens_used, metadata)
       VALUES (?, ?, ?, 'running', 0.00, 0.00, 0, 0, 0, ?)
       ON DUPLICATE KEY UPDATE
         model_version = VALUES(model_version),
         status = VALUES(status),
         metadata = VALUES(metadata),
         updated_at = CURRENT_TIMESTAMP`,
      [providerId, modelName, modelVersion, JSON.stringify(modelMetadata)]
    );

    const id = result?.insertId || null;
    console.log(`Upserted model: ${modelName}${id ? ` (ID: ${id})` : ''}`);

    console.log('All models created successfully!');
  } catch (error) {
    console.error('Error creating models:', error);
  }
}

populateModels();
