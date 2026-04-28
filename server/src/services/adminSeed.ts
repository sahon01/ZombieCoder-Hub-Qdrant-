import { executeQuery } from '../database/connection';
import { Logger } from '../utils/logger';

const logger = new Logger();

type AdminSeedConfig = {
  enabled: boolean;
  email: string;
  name: string;
  passwordHash: string;
};

function loadAdminSeedConfig(): AdminSeedConfig {
  const enabledRaw = (process.env.ADMIN_SEED_ENABLED ?? 'true').trim().toLowerCase();
  const enabled = enabledRaw === 'true' || enabledRaw === '1' || enabledRaw === 'yes';

  return {
    enabled,
    email: (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase(),
    name: (process.env.ADMIN_NAME || 'Admin').trim(),
    passwordHash: (process.env.ADMIN_PASSWORD_HASH || '').trim()
  };
}

export async function ensureAdminUserSeeded(): Promise<void> {
  const cfg = loadAdminSeedConfig();

  if (!cfg.enabled) {
    logger.info('Admin seed disabled');
    return;
  }

  if (!cfg.passwordHash) {
    logger.warn('ADMIN_PASSWORD_HASH is not set; skipping admin seed');
    return;
  }

  await executeQuery(
    `INSERT INTO roles (name, description, is_system)
     VALUES ('admin', 'System administrator with full access', TRUE)
     ON DUPLICATE KEY UPDATE description = VALUES(description), is_system = VALUES(is_system)`
  );

  const roles: any[] = await executeQuery('SELECT id FROM roles WHERE name = ? LIMIT 1', ['admin']);
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new Error('Failed to resolve admin role id');
  }

  const adminRoleId = roles[0].id;

  const existing: any[] = await executeQuery('SELECT id FROM users WHERE email = ? LIMIT 1', [cfg.email]);
  if (Array.isArray(existing) && existing.length > 0) {
    logger.info('Admin user already exists; skipping create');
    return;
  }

  await executeQuery(
    `INSERT INTO users (email, name, password_hash, role_id, is_active)
     VALUES (?, ?, ?, ?, TRUE)`,
    [cfg.email, cfg.name, cfg.passwordHash, adminRoleId]
  );

  logger.info('Admin user created via seed', { email: cfg.email });
}
