const { HttpError } = require('../errors');

// Parses req.body, req.query and req.params against zod schemas.
// Parsed values (trimmed, coerced, defaults applied) are stored on req.valid,
// because Express 5 makes req.query read-only.
function validate(schemas) {
  return (req, res, next) => {
    req.valid = {};
    const details = [];

    for (const [source, schema] of Object.entries(schemas)) {
      const result = schema.safeParse(req[source] ?? {});
      if (result.success) {
        req.valid[source] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ in: source, field: issue.path.join('.') || null, message: issue.message });
        }
      }
    }

    if (details.length > 0) {
      return next(new HttpError(400, details[0].message, details));
    }
    next();
  };
}

module.exports = { validate };
