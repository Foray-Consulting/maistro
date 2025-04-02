module.exports = function() {
  let operations = {
    GET
  };

  function GET(req, res) {
    res.status(200).json({ status: 'ok' });
  }

  // OpenAPI specification for this endpoint
  GET.apiDoc = {
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
  };

  return operations;
};
