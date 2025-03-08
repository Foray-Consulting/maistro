const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const morgan = require('morgan');
const cors = require('cors');
const fs = require('fs-extra');

// Import managers
const ConfigManager = require('./config-manager');
const ExecutionManager = require('./execution-manager');
const CrontabManager = require('./crontab-manager');
const MCPServerManager = require('./mcp-server-manager');

// Enable debugging for execution manager
process.env.DEBUG = 'true';

// Initialize app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, '../data');
fs.ensureDirSync(dataDir);
fs.ensureDirSync(path.join(dataDir, 'prompts'));

// Initialize managers
const configManager = new ConfigManager(path.join(dataDir, 'configs.json'));
const mcpServerManager = new MCPServerManager(path.join(dataDir, 'mcp-servers.json'));
const executionManager = new ExecutionManager(configManager, mcpServerManager, dataDir);
const crontabManager = new CrontabManager(configManager, executionManager);

// Middleware
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Connections map for WebSockets
const connections = new Map();

// API Routes
app.get('/api/configs', (req, res) => {
  const configs = configManager.getAllConfigs();
  res.json(configs);
});

app.post('/api/configs', async (req, res) => {
  try {
    const config = req.body;
    await configManager.saveConfig(config);
    
    // Update crontab if scheduling is enabled
    if (config.schedule && config.schedule.enabled) {
      await crontabManager.updateCronJob(config);
    } else {
      await crontabManager.removeCronJob(config.id);
    }
    
    res.json({ success: true, config });
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/configs/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await configManager.deleteConfig(id);
    await crontabManager.removeCronJob(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting config:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/run/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const config = configManager.getConfigById(id);
    
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    
    // Start execution in background
    executionManager.executeConfig(config, connections.get(id));
    
    res.json({ success: true, message: 'Execution started' });
  } catch (error) {
    console.error('Error starting execution:', error);
    res.status(500).json({ error: error.message });
  }
});

// MCP Server Routes
app.get('/api/mcp-servers', (req, res) => {
  try {
    const mcpServers = mcpServerManager.getAllMCPServers();
    res.json(mcpServers);
  } catch (error) {
    console.error('Error getting MCP servers:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/mcp-servers', async (req, res) => {
  try {
    const mcpServer = req.body;
    await mcpServerManager.saveMCPServer(mcpServer);
    res.json({ success: true, mcpServer });
  } catch (error) {
    console.error('Error saving MCP server:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/mcp-servers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await mcpServerManager.deleteMCPServer(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting MCP server:', error);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket handling
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  
  if (pathname.startsWith('/ws/execution/')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      const configId = pathname.split('/').pop();
      console.log(`WebSocket connection established for config ID: ${configId}`);
      
      // Store the connection
      connections.set(configId, ws);
      
      // Send initial confirmation to client
      ws.send(JSON.stringify({
        type: 'connection',
        message: `WebSocket connection established for configuration ${configId}`
      }));
      
      // Set ping interval to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000); // Send ping every 30 seconds
      
      // Handle WebSocket events
      ws.on('close', () => {
        console.log(`WebSocket connection closed for config ID: ${configId}`);
        connections.delete(configId);
        clearInterval(pingInterval);
      });
      
      ws.on('error', (error) => {
        console.error(`WebSocket error for config ID: ${configId}:`, error);
      });
      
      // Custom ping/pong handling to detect connection issues
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      
      // Mark connection as alive initially
      ws.isAlive = true;
      
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Add interval to check for stale connections
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
}, 45000); // Check every 45 seconds

// Clean up interval on server close
wss.on('close', () => {
  clearInterval(interval);
});

// Handle command-line execution for cron jobs
if (process.argv.length > 2 && process.argv[2] === 'execute-config') {
  const configId = process.argv[3];
  if (!configId) {
    console.error('Error: No configuration ID provided');
    process.exit(1);
  }

  const config = configManager.getConfigById(configId);
  if (!config) {
    console.error(`Error: Configuration with ID ${configId} not found`);
    process.exit(1);
  }

  console.log(`Executing configuration: ${config.name} (${config.id})`);
  executionManager.executeConfig(config)
    .then(() => {
      console.log('Execution completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Execution failed:', error);
      process.exit(1);
    });
} else {
  // Start the server
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Maistro prompt automation server running on http://localhost:${PORT}`);
    
    // Initialize crontab
    crontabManager.initializeCronJobs().catch(err => {
      console.error('Error initializing cron jobs:', err);
    });
  });
}
