module.exports = function(configManager, executionManager) {
  let operations = {
    POST
  };

  function POST(req, res) {
    try {
      const id = req.params.id;
      const config = configManager.getConfigById(id);
      
      if (!config) {
        return res.status(404).json({ error: 'Configuration not found' });
      }
      
      // Get the WebSocket connection
      const ws = req.app.locals.connections.get(id);
      
      if (!ws || ws.readyState !== 1) { // WebSocket.OPEN = 1
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
  }

  // OpenAPI specification for POST operation
  POST.apiDoc = {
    summary: 'Run a configuration',
    description: 'Executes a configuration by ID',
    operationId: 'runConfig',
    parameters: [
      {
        name: 'id',
        in: 'path',
        description: 'Configuration ID',
        required: true,
        schema: {
          type: 'string'
        }
      }
    ],
    responses: {
      200: {
        description: 'Execution started or queued',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: {
                  type: 'boolean',
                  example: true
                },
                message: {
                  type: 'string',
                  example: 'Execution started'
                },
                needsReconnect: {
                  type: 'boolean',
                  description: 'Indicates if the client needs to reconnect the WebSocket',
                  example: false
                }
              }
            }
          }
        }
      },
      404: {
        description: 'Configuration not found',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      },
      500: {
        $ref: '#/components/responses/Error'
      }
    }
  };

  return operations;
};
