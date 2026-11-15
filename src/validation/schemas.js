const { z } = require('zod');

const STATUSES = ['pending', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];
const SORTS = ['manual'];

// Postgres SERIAL is a 32-bit signed integer; larger ids can never match a row.
const MAX_ID = 2147483647;

const oneOf = (field, values) => ({ error: `${field} must be one of: ${values.join(', ')}` });

const isoDate = (message) =>
  z.string({ error: message }).refine((value) => !Number.isNaN(Date.parse(value)), { error: message });

const title = z
  .string({ error: 'title is required' })
  .trim()
  .min(1, { error: 'title is required' })
  .max(200, { error: 'title must be at most 200 characters' });

const description = z
  .string({ error: 'description must be a string' })
  .max(5000, { error: 'description must be at most 5000 characters' });

const labels = z
  .array(z.string({ error: 'labels must be an array of strings' }), {
    error: 'labels must be an array of strings',
  })
  .max(20, { error: 'a task can have at most 20 labels' })
  .transform((values) => [...new Set(values.map((label) => label.trim()).filter(Boolean))])
  .refine((values) => values.every((label) => label.length <= 50), {
    error: 'each label must be at most 50 characters',
  });

const taskId = z.coerce
  .number({ error: 'id must be a positive integer' })
  .int({ error: 'id must be a positive integer' })
  .positive({ error: 'id must be a positive integer' })
  .max(MAX_ID, { error: 'id must be a positive integer' });

const register = z.object({
  email: z.email({ error: 'email must be a valid email address' }).trim(),
  // bcrypt only uses the first 72 bytes of a password, so longer ones are rejected.
  password: z
    .string({ error: 'password is required' })
    .min(8, { error: 'password must be at least 8 characters' })
    .max(72, { error: 'password must be at most 72 characters' }),
});

// Login stays permissive so that accounts created before the password rules still work.
const login = z.object({
  email: z.string({ error: 'email is required' }).trim().min(1, { error: 'email is required' }),
  password: z.string({ error: 'password is required' }).min(1, { error: 'password is required' }),
});

const createTask = z.object({
  title,
  description: description.optional(),
  due_date: isoDate('due_date must be a valid ISO 8601 date').optional(),
  priority: z.enum(PRIORITIES, oneOf('priority', PRIORITIES)).optional(),
  labels: labels.optional(),
});

const updateTask = z.object({
  title: title.optional(),
  description: description.optional(),
  status: z.enum(STATUSES, oneOf('status', STATUSES)).optional(),
  // null clears the due date; leaving the key out keeps it.
  due_date: isoDate('due_date must be a valid ISO 8601 date or null').nullable().optional(),
  priority: z.enum(PRIORITIES, oneOf('priority', PRIORITIES)).optional(),
  labels: labels.optional(),
});

const listTasksQuery = z.object({
  status: z.enum(STATUSES, oneOf('status', STATUSES)).optional(),
  priority: z.enum(PRIORITIES, oneOf('priority', PRIORITIES)).optional(),
  label: z.string().trim().min(1, { error: 'label must not be empty' }).optional(),
  overdue: z
    .enum(['true', 'false'], oneOf('overdue', ['true', 'false']))
    .transform((value) => value === 'true')
    .optional(),
  sort: z.enum(SORTS, oneOf('sort', SORTS)).optional(),
});

const reorderTasks = z.object({
  order: z
    .array(z.number().int().positive().max(MAX_ID), {
      error: 'order must be a non-empty array of task ids',
    })
    .min(1, { error: 'order must be a non-empty array of task ids' }),
});

const taskParams = z.object({ id: taskId });

module.exports = {
  STATUSES,
  PRIORITIES,
  SORTS,
  register,
  login,
  createTask,
  updateTask,
  listTasksQuery,
  reorderTasks,
  taskParams,
};
