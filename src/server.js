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
const ModelManager = require('./model-manager');

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
const modelManager = new ModelManager(path.join(dataDir, 'models.json'));
const executionManager = new ExecutionManager(configManager, mcpServerManager, modelManager, dataDir);
const crontabManager = new CrontabManager(configManager, executionManager);

// Middleware
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Connections map for WebSockets
const connections = new Map();

// API Routes
app.get('/api/configs', (req, res) => {
  // Check if a folder path is specified in the query parameters
  const folderPath = req.query.folderPath !== undefined ? req.query.folderPath : undefined;
  const configs = configManager.getAllConfigs(folderPath);
  res.json(configs);
});

// Folder API routes
app.get('/api/folders', (req, res) => {
  try {
    const folders = configManager.getAllFolders();
    res.json(folders);
  } catch (error) {
    console.error('Error getting folders:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/folders', async (req, res) => {
  try {
    const { path } = req.body;
    if (!path) {
      return res.status(400).json({ error: 'No folder path provided' });
    }
    
    const folder = await configManager.createFolder(path);
    res.json({ success: true, folder });
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/folders/:path', async (req, res) => {
  try {
    const oldPath = decodeURIComponent(req.params.path);
    const { newPath } = req.body;
    
    if (!newPath) {
      return res.status(400).json({ error: 'No new path provided' });
    }
    
    await configManager.renameFolder(oldPath, newPath);
    res.json({ success: true });
  } catch (error) {
    console.error('Error renaming folder:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/folders/:path', async (req, res) => {
  try {
    const path = decodeURIComponent(req.params.path);
    await configManager.deleteFolder(path);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/configs/:id/move', async (req, res) => {
  try {
    const configId = req.params.id;
    const { folderPath } = req.body;
    
    if (folderPath === undefined) {
      return res.status(400).json({ error: 'No folder path provided' });
    }
    
    const config = await configManager.moveConfigToFolder(configId, folderPath);
    
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    
    res.json({ success: true, config });
  } catch (error) {
    console.error('Error moving configuration:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/configs', async (req, res) => {
  try {
    const config = req.body;
    // Validate config before saving
    const savedConfig = await configManager.saveConfig(config);
    
    // Update crontab if scheduling is enabled
    if (config.schedule && config.schedule.enabled) {
      await crontabManager.updateCronJob(config);
    } else {
      await crontabManager.removeCronJob(config.id);
    }
    
    res.json({ success: true, config: savedConfig });
  } catch (error) {
    console.error('Error saving config:', error);
    // Use appropriate status code based on the error
    const statusCode = 
      error.message.includes('already in use') ? 409 :        // Conflict
      error.message.includes('required') ? 400 :              // Bad Request
      error.message.includes('invalid') ? 400 :               // Bad Request
      error.message.includes('missing') ? 400 :               // Bad Request
      500;                                                    // Internal Server Error
    
    res.status(statusCode).json({ 
      error: error.message,
      errorCode: statusCode,
      success: false
    });
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
    
    // Get the WebSocket connection
    const ws = connections.get(id);
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn(`No active WebSocket connection found for config ID: ${id}. Waiting for connection...`);
      
      // Return success but let client know of potential issue
      return res.json({ 
        success: true, 
        message: 'Execution queued, waiting for WebSocket connection',
        needsReconnect: true 
      });
    }
    
    // Start execution in background
    executionManager.executeConfig(config, ws);
    
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

// Model Configuration Routes
app.get('/api/models', (req, res) => {
  try {
    const data = {
      defaultModel: modelManager.getDefaultModel(),
      availableModels: modelManager.getAllModels(),
      apiKey: modelManager.getAPIKey() ? '***API KEY STORED***' : '',
    };
    res.json(data);
  } catch (error) {
    console.error('Error getting model configuration:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/models/default', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model) {
      return res.status(400).json({ error: 'No model specified' });
    }
    
    await modelManager.setDefaultModel(model);
    res.json({ success: true, defaultModel: model });
  } catch (error) {
    console.error('Error setting default model:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/models/apikey', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) {
      return res.status(400).json({ error: 'No API key provided' });
    }
    
    await modelManager.setAPIKey(apiKey);
    res.json({ success: true, message: 'API key saved successfully' });
  } catch (error) {
    console.error('Error saving API key:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/models', async (req, res) => {
  try {
    const { modelId } = req.body;
    if (!modelId) {
      return res.status(400).json({ error: 'No model ID provided' });
    }
    
    const models = await modelManager.addModel(modelId);
    res.json({ success: true, models });
  } catch (error) {
    console.error('Error adding model:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/models/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    if (!modelId) {
      return res.status(400).json({ error: 'No model ID specified' });
    }
    
    const models = await modelManager.removeModel(modelId);
    res.json({ success: true, models });
  } catch (error) {
    console.error('Error removing model:', error);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket handling
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  
  if (pathname.startsWith('/ws/execution/')) {
    try {
      const configId = pathname.split('/').pop();
      console.log(`WebSocket upgrade request received for config ID: ${configId}`);
      
      // Verify the configuration exists before establishing a connection
      const config = configManager.getConfigById(configId);
      if (!config) {
        console.error(`WebSocket connection rejected - Configuration ID not found: ${configId}`);
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }
      
      wss.handleUpgrade(request, socket, head, (ws) => {
        console.log(`WebSocket connection established for config ID: ${configId}`);
        
        // Store the connection with timestamp
        connections.set(configId, ws);
        
        // Add connection state tracking
        ws.isAlive = true;
        ws.configId = configId;
        ws.connectionTime = Date.now();
        
        // Send initial confirmation to client
        ws.send(JSON.stringify({
          type: 'connection',
          message: `WebSocket connection established for configuration ${configId}`,
          timestamp: Date.now()
        }));
        
        // Set ping interval to keep connection alive (reduced interval for better reliability)
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
          } else {
            clearInterval(pingInterval);
          }
        }, 15000); // Send ping every 15 seconds (reduced from 30s)
        
        // Handle incoming messages from client
        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            
            // Handle heartbeat messages
            if (data.type === 'heartbeat') {
              console.log(`Received heartbeat from client for config ID: ${configId}`);
              ws.isAlive = true;
              
              // Respond with a heartbeat acknowledgment
              ws.send(JSON.stringify({
                type: 'heartbeat_ack',
                timestamp: Date.now()
              }));
            }
          } catch (error) {
            console.error(`Error processing client message:`, error);
          }
        });
        
        // Handle WebSocket events
        ws.on('close', (code, reason) => {
          console.log(`WebSocket connection closed for config ID: ${configId} with code: ${code}, reason: ${reason || 'No reason provided'}`);
          connections.delete(configId);
          clearInterval(pingInterval);
        });
        
        ws.on('error', (error) => {
          console.error(`WebSocket error for config ID: ${configId}:`, error);
          // Try to send error information to the client
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'error',
                message: `WebSocket connection error: ${error.message || 'Unknown error'}`,
                timestamp: Date.now()
              }));
            }
          } catch (sendError) {
            console.error('Failed to send error message to client:', sendError);
          }
        });
        
        // Custom ping/pong handling to detect connection issues
        ws.on('pong', () => {
          ws.isAlive = true;
        });
        
        wss.emit('connection', ws, request);
      });
    } catch (error) {
      console.error('WebSocket upgrade error:', error);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  } else {
    socket.destroy();
  }
});

// Add interval to check for stale connections
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log(`Terminating stale WebSocket connection for config ID: ${ws.configId || 'unknown'}`);
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
}, 30000); // Check every 30 seconds (reduced from 45s)

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
