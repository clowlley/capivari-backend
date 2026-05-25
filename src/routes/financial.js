const router = require('express').Router();
const db = require('../db/index');
const authenticate = require('../middleware/authenticate');

router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM financial_entries ORDER BY date DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar financeiro' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, category, type, amount, payment_status, date, responsible, priority, notes, event_id } = req.body;
    const { rows } = await db.query(
      `INSERT INTO financial_entries (name, description, category, type, amount, payment_status, date, responsible, priority, notes, event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [name, description, category, type, amount, payment_status, date, responsible, priority, notes, event_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar lançamento' });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, type, amount, payment_status, date, responsible, priority, notes } = req.body;
    const { rows } = await db.query(
      `UPDATE financial_entries SET name=$1, description=$2, category=$3, type=$4, amount=$5, payment_status=$6, date=$7, responsible=$8, priority=$9, notes=$10, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [name, description, category, type, amount, payment_status, date, responsible, priority, notes, id]
    );
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM financial_entries WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir' });
  }
});

module.exports = router;