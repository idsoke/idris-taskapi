const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const pool = require('../config/db');
const { createUser } = require('../models/userModel');
const { errorHandler } = require('../middleware/errorHandler');

let token;

const uniqueEmail = (prefix) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: uniqueEmail('errors'), password: 'password123' });
  token = res.body.token;
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

describe('task id in the path', () => {
  it.each(['abc', '0', '-1', '1.5', '99999999999'])('returns 400 for id %s', async (id) => {
    const res = await request(app).get(`/tasks/${id}`).set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.details[0]).toMatchObject({ in: 'params', field: 'id' });
  });

  it('returns 400 on PATCH and DELETE too', async () => {
    const patch = await request(app)
      .patch('/tasks/abc')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'x' });
    const del = await request(app).delete('/tasks/abc').set('Authorization', `Bearer ${token}`);

    expect(patch.statusCode).toBe(400);
    expect(del.statusCode).toBe(400);
  });
});

describe('request body errors', () => {
  it('returns 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send('{"title": ');

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Malformed JSON body' });
  });

  it('returns 413 for a body over 100kb', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'big', description: 'x'.repeat(200 * 1024) });

    expect(res.statusCode).toBe(413);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 instead of crashing when there is no body at all', async () => {
    const res = await request(app).post('/auth/register');

    expect(res.statusCode).toBe(400);
  });
});

describe('database failures', () => {
  it('returns a 500 JSON response instead of crashing the process', async () => {
    jest.spyOn(pool, 'query').mockRejectedValueOnce(new Error('connection terminated'));

    const res = await request(app).get('/tasks').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});

describe('errorHandler', () => {
  function run(err) {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    errorHandler(err, {}, res, () => {});
    return res;
  }

  it.each([
    ['22P02', 400],
    ['22003', 400],
    ['23505', 409],
  ])('maps Postgres error %s to HTTP %i', (code, status) => {
    const res = run(Object.assign(new Error('pg'), { code }));
    expect(res.status).toHaveBeenCalledWith(status);
  });

  it('hides unexpected errors behind a generic 500', () => {
    const res = run(new Error('secret internals'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});

describe('register validation', () => {
  it('rejects an invalid email', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('email must be a valid email address');
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail('short'), password: 'short' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('password must be at least 8 characters');
  });

  it('rejects a password longer than bcrypt can hash', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail('long'), password: 'x'.repeat(73) });

    expect(res.statusCode).toBe(400);
  });

  it('lists every problem in details', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'nope', password: 'short' });

    expect(res.statusCode).toBe(400);
    expect(res.body.details.map((d) => d.field)).toEqual(['email', 'password']);
  });

  it('returns 409, not 500, when two sign-ups race for the same email', async () => {
    const email = uniqueEmail('race');
    const results = await Promise.all([
      request(app).post('/auth/register').send({ email, password: 'password123' }),
      request(app).post('/auth/register').send({ email, password: 'password123' }),
    ]);

    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
  });
});

describe('login with an account created before the password rules', () => {
  it('still accepts a short password', async () => {
    const email = uniqueEmail('legacy');
    await createUser({ email, passwordHash: await bcrypt.hash('abc', 10) });

    const res = await request(app).post('/auth/login').send({ email, password: 'abc' });

    expect(res.statusCode).toBe(200);
  });
});

describe('task validation', () => {
  it('trims the title and rejects a blank one', async () => {
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '  Padded  ' });
    expect(created.body.title).toBe('Padded');

    const blank = await request(app)
      .patch(`/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '   ' });
    expect(blank.statusCode).toBe(400);
  });

  it('rejects overdue values other than true or false', async () => {
    const res = await request(app).get('/tasks?overdue=yes').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.details[0]).toMatchObject({ in: 'query', field: 'overdue' });
  });

  it('rejects more than 20 labels', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Too many labels', labels: Array.from({ length: 21 }, (_, i) => `l${i}`) });

    expect(res.statusCode).toBe(400);
  });
});
