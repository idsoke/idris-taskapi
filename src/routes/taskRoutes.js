const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const schemas = require('../validation/schemas');
const taskController = require('../controllers/taskController');

const router = Router();
const byId = { params: schemas.taskParams };

router.use(requireAuth);

router.post('/', validate({ body: schemas.createTask }), taskController.create);
router.get('/', validate({ query: schemas.listTasksQuery }), taskController.list);
router.patch('/reorder', validate({ body: schemas.reorderTasks }), taskController.reorder);
router.get('/:id', validate(byId), taskController.getOne);
router.patch('/:id', validate({ ...byId, body: schemas.updateTask }), taskController.update);
router.delete('/:id', validate(byId), taskController.remove);

module.exports = router;
