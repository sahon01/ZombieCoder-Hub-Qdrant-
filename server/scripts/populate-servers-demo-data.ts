import { initializeDatabase, executeQuery, closeDatabase } from '../src/database/connection';
import { Logger } from '../src/utils/logger';
import dotenv from 'dotenv';

dotenv.config();

const logger = new Logger();

async function populateServersDemoData() {
    try {
        logger.info('Starting servers demo data population...');

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

        // Clear existing server data (only in development)
        if (process.env.NODE_ENV === 'development') {
            logger.info('Clearing existing server data...');
            await executeQuery('DELETE FROM servers');
        }

        // =====================================================
        // Populate Servers Data
        // =====================================================
        logger.info('Populating Servers...');
        
        const servers = [
            // Production Servers
            {
                name: 'Web Server - US East',
                hostname: 'web01.prod.us-east.example.com',
                ip_address: '192.168.1.10',
                location: 'US East (N. Virginia)',
                status: 'online',
                cpu_load: 23.5,
                memory_usage: 65.2,
                disk_usage: 45.8,
                uptime_seconds: 2592000, // 30 days
                provider_id: 1,
                metadata: {
                    environment: 'production',
                    os: 'Ubuntu 22.04 LTS',
                    region: 'us-east-1',
                    instance_type: 't3.medium'
                }
            },
            {
                name: 'Web Server - EU West',
                hostname: 'web02.prod.eu-west.example.com',
                ip_address: '192.168.2.10',
                location: 'EU West (Ireland)',
                status: 'online',
                cpu_load: 18.2,
                memory_usage: 58.7,
                disk_usage: 38.2,
                uptime_seconds: 2419200, // 28 days
                provider_id: 1,
                metadata: {
                    environment: 'production',
                    os: 'Ubuntu 22.04 LTS',
                    region: 'eu-west-1',
                    instance_type: 't3.medium'
                }
            },
            {
                name: 'Database Master',
                hostname: 'db-master.prod.us-west.example.com',
                ip_address: '192.168.3.10',
                location: 'US West (Oregon)',
                status: 'online',
                cpu_load: 45.8,
                memory_usage: 82.1,
                disk_usage: 72.5,
                uptime_seconds: 2678400, // 31 days
                provider_id: 1,
                metadata: {
                    environment: 'production',
                    os: 'Ubuntu 22.04 LTS',
                    region: 'us-west-2',
                    instance_type: 'r5.large',
                    database_engine: 'MySQL 8.0'
                }
            },
            {
                name: 'Database Replica',
                hostname: 'db-replica.prod.us-west.example.com',
                ip_address: '192.168.3.11',
                location: 'US West (Oregon)',
                status: 'online',
                cpu_load: 32.1,
                memory_usage: 75.3,
                disk_usage: 68.9,
                uptime_seconds: 2505600, // 29 days
                provider_id: 1,
                metadata: {
                    environment: 'production',
                    os: 'Ubuntu 22.04 LTS',
                    region: 'us-west-2',
                    instance_type: 'r5.large',
                    database_engine: 'MySQL 8.0'
                }
            },
            
            // Staging Servers
            {
                name: 'Staging Web Server',
                hostname: 'web-staging.dev.example.com',
                ip_address: '192.168.10.10',
                location: 'US East (N. Virginia)',
                status: 'online',
                cpu_load: 12.3,
                memory_usage: 45.6,
                disk_usage: 28.4,
                uptime_seconds: 864000, // 10 days
                provider_id: 1,
                metadata: {
                    environment: 'staging',
                    os: 'Ubuntu 22.04 LTS',
                    region: 'us-east-1',
                    instance_type: 't3.small'
                }
            },
            {
                name: 'Staging Database',
                hostname: 'db-staging.dev.example.com',
                ip_address: '192.168.10.11',
                location: 'US East (N. Virginia)',
                status: 'online',
                cpu_load: 28.7,
                memory_usage: 62.1,
                disk_usage: 55.3,
                uptime_seconds: 777600, // 9 days
                provider_id: 1,
                metadata: {
                    environment: 'staging',
                    os: 'Ubuntu 22.04 LTS',
                    region: 'us-east-1',
                    instance_type: 't3.medium',
                    database_engine: 'MySQL 8.0'
                }
            },
            
            // Development Servers
            {
                name: 'Dev API Server 1',
                hostname: 'api-dev01.dev.example.com',
                ip_address: '192.168.20.10',
                location: 'Local Development',
                status: 'online',
                cpu_load: 8.9,
                memory_usage: 35.2,
                disk_usage: 22.1,
                uptime_seconds: 172800, // 2 days
                provider_id: null,
                metadata: {
                    environment: 'development',
                    os: 'Ubuntu 22.04 LTS',
                    purpose: 'API Development'
                }
            },
            {
                name: 'Dev API Server 2',
                hostname: 'api-dev02.dev.example.com',
                ip_address: '192.168.20.11',
                location: 'Local Development',
                status: 'offline',
                cpu_load: 0.0,
                memory_usage: 0.0,
                disk_usage: 18.7,
                uptime_seconds: 0,
                provider_id: null,
                metadata: {
                    environment: 'development',
                    os: 'Ubuntu 22.04 LTS',
                    purpose: 'API Development',
                    maintenance_reason: 'Scheduled maintenance'
                }
            },
            {
                name: 'Dev Worker Node',
                hostname: 'worker-dev.dev.example.com',
                ip_address: '192.168.20.12',
                location: 'Local Development',
                status: 'maintenance',
                cpu_load: 0.0,
                memory_usage: 0.0,
                disk_usage: 31.2,
                uptime_seconds: 0,
                provider_id: null,
                metadata: {
                    environment: 'development',
                    os: 'Ubuntu 22.04 LTS',
                    purpose: 'Background job processing',
                    maintenance_reason: 'OS upgrade in progress'
                }
            },
            
            // AI/ML Servers
            {
                name: 'AI Training Cluster Node 1',
                hostname: 'ai-train01.ml.example.com',
                ip_address: '192.168.30.10',
                location: 'US East (N. Virginia)',
                status: 'online',
                cpu_load: 89.2,
                memory_usage: 95.7,
                disk_usage: 88.3,
                uptime_seconds: 1209600, // 14 days
                provider_id: 2,
                metadata: {
                    environment: 'ml-production',
                    os: 'Ubuntu 20.04 LTS',
                    gpu_count: 4,
                    gpu_type: 'NVIDIA A100',
                    purpose: 'Deep learning model training'
                }
            },
            {
                name: 'AI Training Cluster Node 2',
                hostname: 'ai-train02.ml.example.com',
                ip_address: '192.168.30.11',
                location: 'US East (N. Virginia)',
                status: 'online',
                cpu_load: 92.1,
                memory_usage: 97.3,
                disk_usage: 91.8,
                uptime_seconds: 1209600, // 14 days
                provider_id: 2,
                metadata: {
                    environment: 'ml-production',
                    os: 'Ubuntu 20.04 LTS',
                    gpu_count: 4,
                    gpu_type: 'NVIDIA A100',
                    purpose: 'Deep learning model training'
                }
            },
            {
                name: 'AI Inference Server',
                hostname: 'ai-inference.ml.example.com',
                ip_address: '192.168.30.20',
                location: 'US West (Oregon)',
                status: 'degraded',
                cpu_load: 67.4,
                memory_usage: 78.9,
                disk_usage: 65.2,
                uptime_seconds: 864000, // 10 days
                provider_id: 2,
                metadata: {
                    environment: 'ml-production',
                    os: 'Ubuntu 20.04 LTS',
                    gpu_count: 2,
                    gpu_type: 'NVIDIA T4',
                    purpose: 'Real-time model inference',
                    alert: 'High memory usage detected'
                }
            },
            
            // Edge/IoT Servers
            {
                name: 'Edge Gateway - Tokyo',
                hostname: 'edge-tokyo.iot.example.com',
                ip_address: '192.168.40.10',
                location: 'Tokyo, Japan',
                status: 'online',
                cpu_load: 15.6,
                memory_usage: 42.3,
                disk_usage: 35.7,
                uptime_seconds: 2246400, // 26 days
                provider_id: 3,
                metadata: {
                    environment: 'iot-edge',
                    os: 'Raspberry Pi OS',
                    hardware: 'Raspberry Pi 4B',
                    purpose: 'IoT data collection and preprocessing'
                }
            },
            {
                name: 'Edge Gateway - London',
                hostname: 'edge-london.iot.example.com',
                ip_address: '192.168.40.11',
                location: 'London, UK',
                status: 'offline',
                cpu_load: 0.0,
                memory_usage: 0.0,
                disk_usage: 28.9,
                uptime_seconds: 0,
                provider_id: 3,
                metadata: {
                    environment: 'iot-edge',
                    os: 'Raspberry Pi OS',
                    hardware: 'Raspberry Pi 4B',
                    purpose: 'IoT data collection and preprocessing',
                    offline_reason: 'Network connectivity issues'
                }
            },
            
            // Load Balancers
            {
                name: 'Global Load Balancer',
                hostname: 'lb-global.prod.example.com',
                ip_address: '192.168.1.1',
                location: 'Global (Multi-region)',
                status: 'online',
                cpu_load: 35.8,
                memory_usage: 52.4,
                disk_usage: 25.1,
                uptime_seconds: 3196800, // 37 days
                provider_id: 1,
                metadata: {
                    environment: 'production',
                    os: 'Ubuntu 22.04 LTS',
                    load_balancer_type: 'Application Load Balancer',
                    regions_served: ['us-east-1', 'eu-west-1', 'ap-northeast-1']
                }
            },
            {
                name: 'Regional Load Balancer - Asia Pacific',
                hostname: 'lb-apac.prod.example.com',
                ip_address: '192.168.50.10',
                location: 'Asia Pacific (Singapore)',
                status: 'online',
                cpu_load: 22.7,
                memory_usage: 48.9,
                disk_usage: 19.8,
                uptime_seconds: 2937600, // 34 days
                provider_id: 1,
                metadata: {
                    environment: 'production',
                    os: 'Ubuntu 22.04 LTS',
                    load_balancer_type: 'Network Load Balancer',
                    regions_served: ['ap-southeast-1', 'ap-northeast-1', 'ap-south-1']
                }
            }
        ];

        // Insert servers into database
        for (const server of servers) {
            await executeQuery(
                `INSERT INTO servers 
                 (name, hostname, ip_address, location, status, cpu_load, memory_usage, 
                  disk_usage, uptime_seconds, last_heartbeat, provider_id, metadata) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
                [
                    server.name,
                    server.hostname,
                    server.ip_address,
                    server.location,
                    server.status,
                    server.cpu_load,
                    server.memory_usage,
                    server.disk_usage,
                    server.uptime_seconds,
                    server.provider_id,
                    JSON.stringify(server.metadata)
                ]
            );
        }

        logger.info(`Populated ${servers.length} servers successfully!`);
        
        // Log summary statistics
        const statusCounts = await executeQuery(`
            SELECT status, COUNT(*) as count 
            FROM servers 
            GROUP BY status
            ORDER BY status
        `);
        
        logger.info('Server Status Distribution:');
        statusCounts.forEach((row: any) => {
            logger.info(`  ${row.status}: ${row.count} servers`);
        });

    } catch (error) {
        logger.error('Error populating servers demo data:', error);
        process.exit(1);
    } finally {
        await closeDatabase();
    }
}

// Run the population script
populateServersDemoData();