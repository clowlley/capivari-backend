const router = require('express').Router();
const db = require('../db/index');
const authenticate = require('../middleware/authenticate');

// --- List Types (Categorias) ---

// GET /api/admin/list-types
router.get('/list-types', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM list_types ORDER BY name ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar tipos de lista' });
  }
});

// POST /api/admin/list-types
router.post('/list-types', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    const { rows } = await db.query(
      'INSERT INTO list_types (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar tipo de lista' });
  }
});

// PUT /api/admin/list-types/:id
router.put('/list-types/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const { rows } = await db.query(
      `UPDATE list_types SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [name, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Categoria não encontrada' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

// DELETE /api/admin/list-types/:id
router.delete('/list-types/:id', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM list_types WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir categoria' });
  }
});

// --- List Registrations (Cadastros na Lista) ---

// GET /api/admin/list-registrations
router.get('/list-registrations', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT r.*, t.name as list_name 
      FROM list_registrations r
      JOIN list_types t ON r.list_type_id = t.id
      ORDER BY r.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar cadastros' });
  }
});

// POST /api/admin/list-registrations
router.post('/list-registrations', authenticate, async (req, res) => {
  try {
    const { full_name, cpf_rg, phone, list_type_id, parking, payment_status } = req.body;
    const { rows } = await db.query(
      `INSERT INTO list_registrations (full_name, cpf_rg, phone, list_type_id, parking, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [full_name, cpf_rg, phone, list_type_id, !!parking, payment_status || 'pendente']
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar cadastro' });
  }
});

// PUT /api/admin/list-registrations/:id
router.put('/list-registrations/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, cpf_rg, phone, list_type_id, parking, payment_status } = req.body;
    const { rows } = await db.query(
      `UPDATE list_registrations
       SET full_name = COALESCE($1, full_name),
           cpf_rg = COALESCE($2, cpf_rg),
           phone = COALESCE($3, phone),
           list_type_id = COALESCE($4, list_type_id),
           parking = COALESCE($5, parking),
           payment_status = COALESCE($6, payment_status)
       WHERE id = $7 RETURNING *`,
      [full_name, cpf_rg, phone, list_type_id, parking, payment_status, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Registro não encontrado' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar registro' });
  }
});

// DELETE /api/admin/list-registrations/:id
router.delete('/list-registrations/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM list_registrations WHERE id = $1', [id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir cadastro' });
  }
});

module.exports = router;