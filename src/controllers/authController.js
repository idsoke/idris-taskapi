const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createUser, findUserByEmail } = require('../models/userModel');

const SALT_ROUNDS = 10;

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
}

async function register(req, res) {
  const { email, password } = req.valid.body;

  const existing = await findUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  let user;
  try {
    user = await createUser({ email, passwordHash });
  } catch (err) {
    // Two concurrent sign-ups with the same email: the unique index catches the second one.
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }

  res.status(201).json({ user, token: signToken(user) });
}

async function login(req, res) {
  const { email, password } = req.valid.body;

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  res.json({
    user: { id: user.id, email: user.email, role: user.role },
    token: signToken(user),
  });
}

module.exports = { register, login };
