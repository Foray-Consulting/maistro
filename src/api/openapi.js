module.exports = {
  openapi: '3.0.0',
  info: {
    title: 'Maistro API',
    version: '0.1.0',
    description: 'API documentation for the Maistro prompt automation tool',
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
    contact: {
      name: 'Maistro Support',
      url: 'https://github.com/forayconsulting/maistro',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Development server',
    },
  ],
  components: {
    schemas: {
      Config: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique identifier for the configuration',
            example: 'config-1615478362547',
          },
          name: {
            type: 'string',
            description: 'Name of the configuration',
            example: 'Daily Report Generator',
          },
          path: {
            type: 'string',
            description: 'Folder path for the configuration',
            example: 'reports/daily',
          },
          prompts: {
            type: 'array',
            description: 'List of prompts to execute in sequence',
            items: {
              oneOf: [
                {
                  type: 'string',
                  description: 'Simple prompt text',
                },
                {
                  type: 'object',
                  properties: {
                    text: {
                      type: 'string',
                      description: 'Prompt text',
                    },
                    mcpServerIds: {
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                      description: 'List of MCP server IDs to use with this prompt',
                    },
                    model: {
                      type: 'string',
                      description: 'Model to use for this prompt',
                      nullable: true,
                    },
                  },
                },
              ],
            },
          },
          trigger: {
            type: 'object',
            properties: {
              enabled: {
                type: 'boolean',
                description: 'Whether the trigger is enabled',
              },
              configId: {
                type: 'string',
                description: 'ID of the configuration to trigger',
              },
              preserveSession: {
                type: 'boolean',
                description: 'Whether to preserve the session when triggering',
              },
            },
          },
          schedule: {
            type: 'object',
            properties: {
              enabled: {
                type: 'boolean',
                description: 'Whether scheduling is enabled',
              },
              frequency: {
                type: 'string',
                enum: ['daily', 'weekly', 'monthly'],
                description: 'Frequency of execution',
              },
              time: {
                type: 'string',
                description: 'Time of execution (HH:MM)',
                example: '09:00',
              },
              days: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
                },
                description: 'Days of the week for weekly frequency',
              },
              dayOfMonth: {
                type: 'integer',
                description: 'Day of the month for monthly frequency',
                minimum: 1,
                maximum: 31,
              },
            },
          },
        },
        required: ['id', 'name', 'prompts'],
      },
      Folder: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Full path of the folder',
            example: 'reports/daily',
          },
          name: {
            type: 'string',
            description: 'Name of the folder',
            example: 'daily',
          },
          parentPath: {
            type: 'string',
            description: 'Path of the parent folder',
            example: 'reports',
          },
        },
        required: ['path', 'name'],
      },
      MCPServer: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique identifier for the MCP server',
            example: 'mcp-server-1615478362547',
          },
          name: {
            type: 'string',
            description: 'Name of the MCP server',
            example: 'Weather API',
          },
          command: {
            type: 'string',
            description: 'Command to execute the MCP server',
            example: 'node',
          },
          args: {
            type: 'string',
            description: 'Arguments for the command',
            example: '/path/to/weather-server.js',
          },
          env: {
            type: 'object',
            description: 'Environment variables for the MCP server',
            additionalProperties: {
              type: 'string',
            },
            example: {
              API_KEY: 'your-api-key',
            },
          },
          description: {
            type: 'string',
            description: 'Description of the MCP server',
            example: 'Provides weather data via the OpenWeather API',
          },
          defaultEnabled: {
            type: 'boolean',
            description: 'Whether the MCP server is enabled by default for new prompts',
          },
        },
        required: ['id', 'name', 'command'],
      },
      Model: {
        type: 'object',
        properties: {
          defaultModel: {
            type: 'string',
            description: 'Default model to use for prompts',
            example: 'anthropic/claude-3.7-sonnet',
          },
          availableModels: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'List of available models',
            example: [
              'anthropic/claude-3.7-sonnet:thinking',
              'anthropic/claude-3.7-sonnet',
              'openai/o3-mini-high',
              'openai/gpt-4o-2024-11-20',
            ],
          },
          apiKey: {
            type: 'string',
            description: 'API key status',
            example: '***API KEY STORED***',
          },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description: 'Error message',
          },
        },
        required: ['error'],
      },
      Success: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            description: 'Success status',
            example: true,
          },
          message: {
            type: 'string',
            description: 'Success message',
            example: 'Operation completed successfully',
          },
        },
        required: ['success'],
      },
    },
    responses: {
      Error: {
        description: 'Error response',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error',
            },
          },
        },
      },
      Success: {
        description: 'Success response',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Success',
            },
          },
        },
      },
    },
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'Health check endpoint',
        description: 'Returns the health status of the API',
        operationId: 'getHealth',
        responses: {
          200: {
            description: 'Health status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      example: 'ok'
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/configs': {
      get: {
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
      },
      post: {
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
      }
    },
    '/api/configs/{id}': {
      delete: {
        summary: 'Delete a configuration',
        description: 'Deletes a configuration by ID',
        operationId: 'deleteConfig',
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
            description: 'Configuration deleted successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Success'
                }
              }
            }
          },
          500: {
            $ref: '#/components/responses/Error'
          }
        }
      }
    },
    '/api/configs/{id}/move': {
      put: {
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
      }
    },
    '/api/run/{id}': {
      post: {
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
      }
    }
  },
};
