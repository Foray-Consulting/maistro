module.exports = function(configManager) {
  let operations = {
    PUT
  };

  function PUT(req, res) {
    try {
      const configId = req.params.id;
      const { folderPath } = req.body;
      
      if (folderPath === undefined) {
        return res.status(400).json({ error: 'No folder path provided' });
      }
      
      const config = configManager.moveConfigToFolder(configId, folderPath);
      
      if (!config) {
        return res.status(404).json({ error: 'Configuration not found' });
      }
      
      res.json({ success: true, config });
    } catch (error) {
      console.error('Error moving configuration:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // OpenAPI specification for PUT operation
  PUT.apiDoc = {
    summary: 'Move a configuration to a folder',
    description: 'Moves a configuration to a specified folder',
    operationId: 'moveConfig',
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
    requestBody: {
      description: 'Folder path to move the configuration to',
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              folderPath: {
                type: 'string',
                description: 'Target folder path',
                example: 'reports/daily'
              }
            },
            required: ['folderPath']
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Configuration moved successfully',
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
      400: {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
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
