ALTER TABLE tasks ADD COLUMN IF NOT EXISTS position INTEGER;

UPDATE tasks t
SET position = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC, id ASC) AS rn
  FROM tasks
) sub
WHERE t.id = sub.id AND t.position IS NULL;

ALTER TABLE tasks ALTER COLUMN position SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN position SET DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_tasks_user_position ON tasks(user_id, position);
