
'use strict';
const express = require('express');
const router = express.Router();
const CorreoConfiguracion = require('../models/CorreoConfiguracion');

function isValidEmail(v='') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
}

// GET actual
router.get('/notification-email', async (_req, res) => {
  try {
    const row = await CorreoConfiguracion.findOne({ order: [['id','ASC']] });
    const fallback = process.env.SALES_TO || process.env.MAIL_TO || 'ventas@example.com';
    return res.json({ success: true, correo: row?.correo || fallback });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'No se pudo leer el correo', details: e.message });
  }
});

// PUT actualizar/crear
router.put('/notification-email', async (req, res) => {
  try {
    const { correo } = req.body || {};
    if (!isValidEmail(correo)) {
      return res.status(400).json({ success: false, message: 'Correo inválido' });
    }

    const row = await CorreoConfiguracion.findOne({ order: [['id','ASC']] });
    if (row) {
      await row.update({ correo });
    } else {
      await CorreoConfiguracion.create({ correo });
    }
    return res.json({ success: true, message: 'Correo actualizado', correo });
  } catch (e) {
    return res.status(500).json({ success: false, message: 'Error al guardar', details: e.message });
  }
});

module.exports = router;
