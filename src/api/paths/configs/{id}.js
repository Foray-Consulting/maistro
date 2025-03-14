module.exports = function(configManager, crontabManager) {
  let operations = {
    DELETE
  };

  function DELETE(req, res) {
    try {
      const id = req.params.id;
      configManager.deleteConfig(id);
      crontabManager.removeCronJob(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting config:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // OpenAPI specification for DELETE operation
  DELETE.apiDoc = {
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
  };

  return operations;
};
