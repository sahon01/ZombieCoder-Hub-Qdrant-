import express from 'express';
import { executeQuery } from '../database/connection';
import { Logger } from '../utils/logger';

const router = express.Router();
const logger = new Logger();

router.get('/', async (req, res) => {
  try {
    if (!(global as any).connection) {
      logger.warn('Database not available, cannot fetch plans');
      res.status(503).json({
        success: false,
        error: 'Database not available',
        message: 'Cannot fetch plans when running in offline mode'
      });
      return;
    }

    const plans = await executeQuery(
      `SELECT id, name, description, duration_days, price_usd, is_active, features_json, created_at, updated_at
       FROM plans
       WHERE is_active = TRUE
       ORDER BY price_usd ASC, duration_days ASC, id ASC`
    );

    res.json({
      success: true,
      data: plans,
      count: Array.isArray(plans) ? plans.length : 0,
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to fetch plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch plans',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

export default router;
