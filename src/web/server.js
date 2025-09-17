import "dotenv/config";
import express from 'express';
import session from 'express-session';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import http from 'http';
import { WebSocketServer } from 'ws';
import routes from './routes/index.js';
import { ensureDB } from '../lib/db.js';
import { createLogger } from '../utils/logger.js';
import { getLiveStatsSnapshot } from './routes/admin.js';

const logger = createLogger('Dashboard');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const appDistDir = path.join(__dirname, 'app', 'dist');
const hasBuiltApp = fs.existsSync(path.join(appDistDir, 'index.html'));

// Read port from environment or use default
const DEFAULT_PORT = 4003;
let port = Number(process.env.DASHBOARD_PORT || DEFAULT_PORT);
const sessionSecret = process.env.DASHBOARD_SESSION_SECRET || 'change_me';

// Create a simple Express app
function createApp() {
  const app = express();
  
  // Basic middleware
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 }
  }));
  
  const sendIndex = (res) => {
    const indexPath = hasBuiltApp
      ? path.join(appDistDir, 'index.html')
      : path.join(publicDir, 'index.html');
    res.sendFile(indexPath);
  };
  
  // Static file handling
  if (hasBuiltApp) {
    app.use(express.static(appDistDir));
  }
  app.use(express.static(publicDir));
  
  // Specific route for favicon to avoid 404 errors
  app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No content response if favicon not found
  });
  
  // Main route
  app.get('/', (req, res) => {
    sendIndex(res);
  });
  
  // API routes
  app.use(routes);
  
  // SPA fallback
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/ws')) {
      return next();
    }
    if (req.path.includes('.')) {
      return next();
    }
    return sendIndex(res);
  });
  
  // Error handler
  app.use((err, req, res, next) => {
    logger.error('Unhandled dashboard error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });
  
  return app;
}

// Try to bind to a port with retry logic
async function bindToPort(server, startPort, maxAttempts = 10) {
  let currentPort = startPort;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      await new Promise((resolve, reject) => {
        server.once('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            currentPort++;
            logger.warn(`Port ${currentPort-1} in use, trying ${currentPort}`);
            server.removeAllListeners('listening');
            server.listen(currentPort, resolve);
          } else {
            reject(err);
          }
        });
        
        server.once('listening', () => {
          logger.ok(`Dashboard listening on http://localhost:${currentPort}`);
          resolve();
        });
        
        server.listen(currentPort);
      });
      
      return currentPort; // Successfully bound
    } catch (err) {
      attempts++;
      logger.error(`Failed to bind to port ${currentPort}:`, err);
      currentPort++;
    }
  }
  
  throw new Error(`Failed to find an available port after ${maxAttempts} attempts`);
}

// Main function to start the server
async function startServer() {
  try {
    // Initialize database
    logger.info('Initializing database...');
    await ensureDB();
    logger.info('Database initialized successfully');
    
    // Create Express app and HTTP server
    const app = createApp();
    const server = http.createServer(app);
    
    // Bind to a port
    const activePort = await bindToPort(server, port);
    
    // Setup WebSocket server after HTTP server is running
    const wss = new WebSocketServer({ server, path: '/ws' });
    
    wss.on('error', (err) => {
      logger.error('WebSocket error:', err);
    });
    
    wss.on('connection', (ws) => {
      logger.info('WebSocket client connected');
      
      // Setup periodic stats push
      const pushStats = async () => {
        try {
          const stats = await getLiveStatsSnapshot();
          if (stats && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'stats', payload: stats }));
          }
        } catch (err) {
          logger.warn('Failed to push stats:', err);
        }
      };
      
      // Send initial stats
      pushStats();
      
      // Setup interval for regular updates
      const interval = setInterval(pushStats, 15000);
      
      // Clean up on disconnect
      ws.on('close', () => {
        clearInterval(interval);
        logger.info('WebSocket client disconnected');
      });
    });
    
    logger.ok(`Dashboard ready at http://localhost:${activePort}`);
    
    // If the port changed, log a warning about the OAuth2 redirect URI
    if (activePort !== DEFAULT_PORT) {
      logger.warn(`Running on port ${activePort} but OAuth2 redirect URI might be configured for port ${DEFAULT_PORT}`);
      logger.warn(`Update your Discord Developer Portal OAuth2 redirect URI to: http://localhost:${activePort}/auth/callback`);
    }
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Start the server
startServer();



