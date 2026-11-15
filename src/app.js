require('dotenv').config();
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const authRoutes = require('./routes/authRoutes');
const taskRoutes = require('./routes/taskRoutes');
const openapiSpec = require('./docs/openapi');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/openapi.json', (req, res) => res.json(openapiSpec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, { customSiteTitle: 'idris-taskapi docs' }));
app.use('/auth', authRoutes);
app.use('/tasks', taskRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Express 5 forwards rejected promises from async handlers here, so a failed
// query becomes a JSON error response instead of crashing the process.
app.use(errorHandler);

module.exports = app;
