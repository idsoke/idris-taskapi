const {
  createTask,
  listTasksByUser,
  findTaskById,
  updateTask,
  deleteTask,
  reorderTasks,
} = require('../models/taskModel');

// Request bodies, queries and params are validated by the zod schemas in
// src/validation/schemas.js before these handlers run (see taskRoutes.js).

async function create(req, res) {
  const { title, description, due_date, priority, labels } = req.valid.body;
  const task = await createTask({
    userId: req.user.id,
    title,
    description,
    dueDate: due_date,
    priority,
    labels,
  });
  res.status(201).json(task);
}

async function list(req, res) {
  const { status, overdue, priority, label, sort } = req.valid.query;
  const tasks = await listTasksByUser(req.user.id, {
    status,
    overdue: overdue === true,
    priority,
    label,
    sort,
  });
  res.json(tasks);
}

async function getOne(req, res) {
  const task = await findTaskById(req.valid.params.id, req.user.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(task);
}

async function update(req, res) {
  const { title, description, status, priority, labels } = req.valid.body;
  const fields = { title, description, status, priority, labels };
  if ('due_date' in req.valid.body) {
    fields.dueDate = req.valid.body.due_date;
  }

  const task = await updateTask(req.valid.params.id, req.user.id, fields);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(task);
}

async function remove(req, res) {
  const deleted = await deleteTask(req.valid.params.id, req.user.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.status(204).send();
}

async function reorder(req, res) {
  const result = await reorderTasks(req.user.id, req.valid.body.order);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result.value);
}

module.exports = { create, list, getOne, update, remove, reorder };
