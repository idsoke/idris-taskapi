const request = require('supertest');
const app = require('../app');
const pool = require('../config/db');
const authRoutes = require('../routes/authRoutes');
const taskRoutes = require('../routes/taskRoutes');

afterAll(async () => {
  await pool.end();
});

// Every route registered on the routers, as OpenAPI-style "method path" strings.
function documentableRoutes() {
  const routes = [];
  for (const [prefix, router] of [['/auth', authRoutes], ['/tasks', taskRoutes]]) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const path = `${prefix}${layer.route.path === '/' ? '' : layer.route.path}`.replace(
        /:(\w+)/g,
        '{$1}'
      );
      for (const method of Object.keys(layer.route.methods)) {
        routes.push(`${method} ${path}`);
      }
    }
  }
  return routes;
}

describe('GET /openapi.json', () => {
  it('serves the OpenAPI document', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.statusCode).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
  });

  it('documents every route the API exposes', async () => {
    const { body: spec } = await request(app).get('/openapi.json');
    const documented = Object.entries(spec.paths).flatMap(([path, item]) =>
      Object.keys(item)
        .filter((key) => key !== 'parameters')
        .map((method) => `${method} ${path}`)
    );

    expect(documentableRoutes().sort()).toEqual(
      documented.filter((route) => route !== 'get /health').sort()
    );
  });

  it('builds request schemas from the zod validators', async () => {
    const { body: spec } = await request(app).get('/openapi.json');
    const register = spec.components.schemas.RegisterRequest;

    expect(register.properties.password).toMatchObject({ minLength: 8, maxLength: 72 });
    expect(register.required).toEqual(['email', 'password']);
  });
});

describe('GET /docs', () => {
  it('serves Swagger UI', async () => {
    const res = await request(app).get('/docs/').redirects(1);

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});
