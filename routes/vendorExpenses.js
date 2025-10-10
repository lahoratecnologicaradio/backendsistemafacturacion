const express = require('express');
const router = express.Router();
const { sequelize } = require('../db');
const VendorExpense = require('../models/VendorExpense');

// Crear gasto
router.post('/add', async (req, res) => {
  try {
    const data = req.body || {};
    const created = await VendorExpense.create({
      vendedor_id: data.vendedor_id ?? null,
      categoria: data.categoria ?? null,
      monto: data.monto ?? null,
      descripcion: data.descripcion ?? null,
      fecha: data.fecha ?? null,
      hora: data.hora ?? null,
      comprobante_url: data.comprobante_url ?? null,
    });
    return res.status(201).json({ success: true, data: created });
  } catch (e) {
    console.error('Error creando gasto:', e);
    return res.status(500).json({ success: false, error: 'Error al crear gasto', details: e.message });
  }
});

// Listar todos
router.get('/all', async (_req, res) => {
  try {
    await sequelize.authenticate();
    const items = await VendorExpense.findAll({ order: [['fecha','DESC'], ['id','DESC']] });
    return res.json({ success: true, data: items });
  } catch (e) {
    console.error('Error listando gastos:', e);
    return res.status(500).json({ success: false, error: 'Error al listar gastos', details: e.message });
  }
});

module.exports = router;
