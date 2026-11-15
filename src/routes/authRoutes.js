const { Router } = require('express');
const { register, login } = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const schemas = require('../validation/schemas');

const router = Router();

router.post('/register', validate({ body: schemas.register }), register);
router.post('/login', validate({ body: schemas.login }), login);

module.exports = router;
