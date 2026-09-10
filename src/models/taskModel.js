const pool = require('../config/db');

async function createTask({ userId, title, description, dueDate, priority, labels }) {
  const result = await pool.query(
    `INSERT INTO tasks (user_id, title, description, due_date, priority, labels, position)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'medium'), COALESCE($6::text[], '{}'),
             (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE user_id = $1))
     RETURNING *`,
    [userId, title, description || null, dueDate || null, priority || null, labels || null]
  );
  return result.rows[0];
}

async function listTasksByUser(userId, { status, overdue, priority, label, sort } = {}) {
  const conditions = ['user_id = $1'];
  const params = [userId];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  if (priority) {
    params.push(priority);
    conditions.push(`priority = $${params.length}`);
  }

  if (label) {
    params.push(label);
    conditions.push(`labels @> ARRAY[$${params.length}]::text[]`);
  }

  if (overdue === true) {
    conditions.push(`due_date < now() AND status != 'done'`);
  }

  const where = conditions.join(' AND ');
  const orderBy = sort === 'manual' ? 'position ASC' : 'due_date ASC NULLS LAST, created_at DESC';
  const result = await pool.query(`SELECT * FROM tasks WHERE ${where} ORDER BY ${orderBy}`, params);
  return result.rows;
}

async function findTaskById(id, userId) {
  const result = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [
    id,
    userId,
  ]);
  return result.rows[0];
}

async function updateTask(id, userId, fields) {
  const { title, description, status, dueDate, priority, labels } = fields;
  const result = await pool.query(
    `UPDATE tasks
     SET title = COALESCE($1, title),
         description = COALESCE($2, description),
         status = COALESCE($3, status),
         priority = COALESCE($4, priority),
         due_date = CASE WHEN $5 THEN $6 ELSE due_date END,
         labels = COALESCE($7::text[], labels),
         updated_at = now()
     WHERE id = $8 AND user_id = $9
     RETURNING *`,
    [
      title ?? null,
      description ?? null,
      status ?? null,
      priority ?? null,
      'dueDate' in fields,
      dueDate ?? null,
      labels ?? null,
      id,
      userId,
    ]
  );
  return result.rows[0];
}

async function deleteTask(id, userId) {
  const result = await pool.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id', [
    id,
    userId,
  ]);
  return result.rows[0];
}

async function reorderTasks(userId, orderedIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query('SELECT id FROM tasks WHERE user_id = $1', [userId]);
    const existingIds = existing.rows.map((row) => row.id);
    const sameSet =
      existingIds.length === orderedIds.length &&
      existingIds.every((id) => orderedIds.includes(id));

    if (!sameSet) {
      await client.query('ROLLBACK');
      return { error: 'order must contain exactly the ids of all of your tasks, each exactly once' };
    }

    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        'UPDATE tasks SET position = $1, updated_at = now() WHERE id = $2 AND user_id = $3',
        [i + 1, orderedIds[i], userId]
      );
    }

    const result = await client.query('SELECT * FROM tasks WHERE user_id = $1 ORDER BY position ASC', [
      userId,
    ]);
    await client.query('COMMIT');
    return { value: result.rows };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createTask,
  listTasksByUser,
  findTaskById,
  updateTask,
  deleteTask,
  reorderTasks,
};
