const router = require('express').Router();
const db = require('../db/index');
const authenticate = require('../middleware/authenticate');

router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM operational_tasks ORDER BY deadline ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar tarefas' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, responsible, deadline, priority, status, event_id } = req.body;
    const { rows } = await db.query(
      `INSERT INTO operational_tasks (title, description, responsible, deadline, priority, status, event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title, description, responsible, deadline, priority || 'media', status || 'pendente', event_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar tarefa' });
  }
});

const ALLOWED_TASK_FIELDS = new Set([
  'title', 'description', 'responsible', 'deadline',
  'priority', 'status', 'notes'
]);

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const cleanData = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (ALLOWED_TASK_FIELDS.has(key) && value !== undefined) {
        cleanData[key] = value;
      }
    }

    const fields = Object.keys(cleanData);
    const values = Object.values(cleanData);

    if (fields.length === 0) return res.status(400).json({ error: 'Nenhum dado para atualizar' });

    const setClause = fields.map((f, i) => `"${f}" = $${i + 1}`).join(', ');
    const { rows } = await db.query(
      `UPDATE operational_tasks SET ${setClause} WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Tarefa não encontrada' });

    res.json(rows[0]);
  } catch (error) {
    console.error('ERRO NO UPDATE TASK:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar tarefa.' });
  }
});

module.exports = router;