module.exports = function(configManager, crontabManager) {
  let operations = {
    GET,
    POST
  };

  function GET(req, res) {
    try {
      // Check if a folder path is specified in the query parameters
      const folderPath = req.query.folderPath !== undefined ? req.query.folderPath : undefined;
      const configs = configManager.getAllConfigs(folderPath);
      res.json(configs);
    } catch (error) {
      console.error('Error getting configurations:', error);
      res.status(500).json({ error: error.message });
    }
  }

  function POST(req, res) {
    try {
      const config = req.body;
      configManager.saveConfig(config);
      
      // Update crontab if scheduling is enabled
      if (config.schedule && config.schedule.enabled) {
        crontabManager.updateCronJob(config);
      } else {
        crontabManager.removeCronJob(config.id);
      }
      
      res.json({ success: true, config });
    } catch (error) {
      console.error('Error saving config:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // OpenAPI specification for GET operation
  GET.apiDoc = {
    summary: 'Get all configurations',
    description: 'Returns a list of all configurations, optionally filtered by folder path',
    operationId: 'getConfigs',
    parameters: [
      {
        name: 'folderPath',
        in: 'query',
        description: 'Filter configurations by folder path',
        required: false,
        schema: {
          type: 'string'
        }
      }
    ],
    responses: {
      200: {
        description: 'List of configurations',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Config'
              }
            }
          }
        }
      },
      500: {
        $ref: '#/components/responses/Error'
      }
    }
  };

  // OpenAPI specification for POST operation
  POST.apiDoc = {
    summary: 'Create or update a configuration',
    description: 'Creates a new configuration or updates an existing one',
    operationId: 'saveConfig',
    requestBody: {
      description: 'Configuration to save',
      required: true,
      content: {
        'application/json': {
          schema: {
            $ref: '#/components/schemas/Config'
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Configuration saved successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: {
                  type: 'boolean',
                  example: true
                },
                config: {
                  $ref: '#/components/schemas/Config'
                }
              }
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
