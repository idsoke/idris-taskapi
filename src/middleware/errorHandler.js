const { HttpError } = require('../errors');

// Postgres error codes that are caused by the request rather than by the server.
const PG_CLIENT_ERRORS = {
  '22P02': { status: 400, message: 'Invalid input' }, // invalid_text_representation
  '22003': { status: 400, message: 'Number out of range' }, // numeric_value_out_of_range
  '23505': { status: 409, message: 'Resource already exists' }, // unique_violation
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    const body = { error: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }

  // Errors raised by express.json(): malformed JSON, body too large, and so on.
  if (err.type && err.status >= 400 && err.status < 500) {
    const message = err.type === 'entity.parse.failed' ? 'Malformed JSON body' : err.message;
    return res.status(err.status).json({ error: message });
  }

  const pgError = PG_CLIENT_ERRORS[err.code];
  if (pgError) {
    return res.status(pgError.status).json({ error: pgError.message });
  }

  if (process.env.NODE_ENV !== 'test') {
    console.error(err);
  }
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { errorHandler };
