const { z } = require('zod');
const schemas = require('../validation/schemas');
const { version } = require('../../package.json');

// Request schemas come straight from the zod validators, so the docs cannot
// drift from what the API actually accepts.
function requestSchema(schema) {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema, { io: 'input' });
  return jsonSchema;
}

function queryParameters(schema) {
  const { properties = {}, required = [] } = requestSchema(schema);
  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: 'query',
    required: required.includes(name),
    schema: propertySchema,
  }));
}

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema) => ({ 'application/json': { schema } });
const body = (name) => ({ required: true, content: json(ref(name)) });
const errorResponse = (description) => ({ description, content: json(ref('Error')) });

const errors = {
  400: errorResponse('Validation failed'),
  401: errorResponse('Missing, invalid or expired token'),
  404: errorResponse('Task not found'),
};

const idParameter = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
};

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'idris-taskapi',
    version,
    description:
      'Task management REST API with JWT authentication. Register or log in, then click ' +
      '**Authorize** and paste the token to try the /tasks endpoints.',
  },
  tags: [{ name: 'Auth' }, { name: 'Tasks' }, { name: 'System' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      RegisterRequest: requestSchema(schemas.register),
      LoginRequest: requestSchema(schemas.login),
      CreateTaskRequest: requestSchema(schemas.createTask),
      UpdateTaskRequest: requestSchema(schemas.updateTask),
      ReorderTasksRequest: requestSchema(schemas.reorderTasks),
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', example: 'user' },
          created_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'email', 'role'],
      },
      AuthResponse: {
        type: 'object',
        properties: { user: ref('User'), token: { type: 'string' } },
        required: ['user', 'token'],
      },
      Task: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          user_id: { type: 'integer' },
          title: { type: 'string' },
          description: { type: ['string', 'null'] },
          status: { type: 'string', enum: schemas.STATUSES },
          priority: { type: 'string', enum: schemas.PRIORITIES },
          due_date: { type: ['string', 'null'], format: 'date-time' },
          labels: { type: 'array', items: { type: 'string' } },
          position: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'user_id', 'title', 'status', 'priority', 'labels', 'position'],
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'password must be at least 8 characters' },
          details: {
            type: 'array',
            description: 'Every validation problem found, present on 400 responses from validation.',
            items: {
              type: 'object',
              properties: {
                in: { type: 'string', enum: ['body', 'query', 'params'] },
                field: { type: ['string', 'null'] },
                message: { type: 'string' },
              },
            },
          },
        },
        required: ['error'],
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        responses: {
          200: {
            description: 'Service is up',
            content: json({ type: 'object', properties: { status: { type: 'string', example: 'ok' } } }),
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account',
        requestBody: body('RegisterRequest'),
        responses: {
          201: { description: 'Account created', content: json(ref('AuthResponse')) },
          400: errors[400],
          409: errorResponse('Email already registered'),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and get a JWT',
        requestBody: body('LoginRequest'),
        responses: {
          200: { description: 'Logged in', content: json(ref('AuthResponse')) },
          400: errors[400],
          401: errorResponse('Invalid email or password'),
        },
      },
    },
    '/tasks': {
      get: {
        tags: ['Tasks'],
        summary: 'List your tasks',
        security: [{ bearerAuth: [] }],
        parameters: queryParameters(schemas.listTasksQuery),
        responses: {
          200: { description: 'Your tasks', content: json({ type: 'array', items: ref('Task') }) },
          400: errors[400],
          401: errors[401],
        },
      },
      post: {
        tags: ['Tasks'],
        summary: 'Create a task',
        security: [{ bearerAuth: [] }],
        requestBody: body('CreateTaskRequest'),
        responses: {
          201: { description: 'Task created', content: json(ref('Task')) },
          400: errors[400],
          401: errors[401],
        },
      },
    },
    '/tasks/reorder': {
      patch: {
        tags: ['Tasks'],
        summary: 'Set the manual order of all your tasks',
        description: '`order` must contain the id of every one of your tasks, each exactly once.',
        security: [{ bearerAuth: [] }],
        requestBody: body('ReorderTasksRequest'),
        responses: {
          200: {
            description: 'Tasks in their new order',
            content: json({ type: 'array', items: ref('Task') }),
          },
          400: errors[400],
          401: errors[401],
        },
      },
    },
    '/tasks/{id}': {
      parameters: [idParameter],
      get: {
        tags: ['Tasks'],
        summary: 'Get one task',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'The task', content: json(ref('Task')) },
          400: errors[400],
          401: errors[401],
          404: errors[404],
        },
      },
      patch: {
        tags: ['Tasks'],
        summary: 'Update a task',
        description: 'Only the fields you send are changed. Send `due_date: null` to clear the due date.',
        security: [{ bearerAuth: [] }],
        requestBody: body('UpdateTaskRequest'),
        responses: {
          200: { description: 'The updated task', content: json(ref('Task')) },
          400: errors[400],
          401: errors[401],
          404: errors[404],
        },
      },
      delete: {
        tags: ['Tasks'],
        summary: 'Delete a task',
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: 'Deleted' },
          400: errors[400],
          401: errors[401],
          404: errors[404],
        },
      },
    },
  },
};

module.exports = spec;
