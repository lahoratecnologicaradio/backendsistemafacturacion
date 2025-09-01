const express = require('express');
const router = express.Router();
const VisitaProgramada = require('../models/VisitaProgramada');
const ResultadoVisita = require('../models/ResultadoVisita');
const Vendedor = require('../models/Vendedor');
const Customer = require('../models/Customer');
const { Op } = require('sequelize');

/* ===================== *
 *  Helpers de Fechas    *
 * ===================== */

// YYYY-MM-DD usando zona local (no UTC) para evitar “se fue al día anterior”
function todayYMDLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Acepta 'YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY'
function normalizeToYMD(input) {
  if (!input) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  // DD-MM-YYYY o DD/MM/YYYY
  const m = input.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }
  // Si llega algo tipo “01 de septiembre”, no lo intentes parsear: exige YYYY-MM-DD
  return null;
}

/* ========================================================= *
 *  NUEVA RUTA: TODAS LAS VISITAS EN UNA FECHA DADA (/dia)   *
 *  GET /api/visitas/dia/:fecha
 *  - fecha: YYYY-MM-DD | DD-MM-YYYY | DD/MM/YYYY
 *  - Devuelve pendientes y realizadas de TODOS los vendedores
 * ========================================================= */
router.get('/dia/:fecha', async (req, res) => {
  try {
    const normalized = normalizeToYMD(req.params.fecha);
    if (!normalized) {
      return res.status(400).json({
        success: false,
        message: 'Formato de fecha inválido. Usa YYYY-MM-DD (p.ej. 2025-09-01).'
      });
    }

    const visitas = await VisitaProgramada.findAll({
      where: {
        fecha_programada: normalized,
        estado: { [Op.in]: ['pendiente', 'realizada'] }
      },
      include: [
        { model: Customer, as: 'cliente', attributes: ['id','full_name','address','c_number'] },
        { model: Vendedor, as: 'vendedor', attributes: ['id','nombre','email'] },
        { model: ResultadoVisita, as: 'resultado', required: false }
      ],
      order: [['hora_programada', 'ASC'], ['prioridad', 'DESC']]
    });

    return res.json({
      success: true,
      fecha: normalized,
      count: visitas.length,
      data: visitas
    });

  } catch (error) {
    console.error('Error en GET /visitas/dia/:fecha:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

/* ========================================================= *
 *  NUEVA RUTA: TODAS LAS VISITAS DE HOY (/hoy)
 *  GET /api/visitas/hoy
 *  - Devuelve pendientes y realizadas de TODOS los vendedores
 * ========================================================= */
router.get('/hoy', async (_req, res) => {
  try {
    const today = todayYMDLocal();

    const visitas = await VisitaProgramada.findAll({
      where: {
        fecha_programada: today,
        estado: { [Op.in]: ['pendiente', 'realizada'] }
      },
      include: [
        { model: Customer, as: 'cliente', attributes: ['id','full_name','address','c_number'] },
        { model: Vendedor, as: 'vendedor', attributes: ['id','nombre','email'] },
        { model: ResultadoVisita, as: 'resultado', required: false }
      ],
      order: [['hora_programada', 'ASC'], ['prioridad', 'DESC']]
    });

    return res.json({
      success: true,
      fecha: today,
      count: visitas.length,
      data: visitas
    });

  } catch (error) {
    console.error('Error en GET /visitas/hoy:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

/* ========================================================= *
 *  AJUSTE A /list: soporta ?date=YYYY-MM-DD para “un día”
 *  y defaults locales para hoy si no pasas nada.
 * ========================================================= */
router.get('/list', async (req, res) => {
  try {
    const today = todayYMDLocal();

    // si viene ?date, úsalo como from=to
    const dateParam = normalizeToYMD(req.query.date);
    const from = dateParam || normalizeToYMD(req.query.from) || today;
    const to   = dateParam || normalizeToYMD(req.query.to)   || today;

    const estado = req.query.estado || 'all';
    const vendedor_id = req.query.vendedor_id ? Number(req.query.vendedor_id) : null;
    const customer_id = req.query.customer_id ? Number(req.query.customer_id) : null;

    const where = {
      fecha_programada: { [Op.between]: [from, to] }
    };

    if (estado !== 'all') {
      where.estado = estado;
    } else {
      where.estado = { [Op.in]: ['pendiente', 'realizada'] };
    }

    if (vendedor_id) where.vendedor_id = vendedor_id;
    if (customer_id) where.customer_id = customer_id;

    const visitas = await VisitaProgramada.findAll({
      where,
      include: [
        { model: Customer, as: 'cliente', attributes: ['id','full_name','address','c_number'] },
        { model: Vendedor, as: 'vendedor', attributes: ['id','nombre','email'] },
        { model: ResultadoVisita, as: 'resultado', required: false }
      ],
      order: [['fecha_programada','ASC'],['hora_programada','ASC'],['prioridad','DESC']]
    });

    // flags útiles
    const base = new Date(`${today}T00:00:00`);
    const withFlags = visitas.map(v => {
      const d = new Date(`${v.fecha_programada}T00:00:00`);
      const days_left = Math.round((d - base) / (1000*60*60*24));
      const is_past = days_left < 0 && v.estado === 'pendiente';
      const is_urgent = v.estado === 'pendiente' && days_left >= 0 && days_left <= 3;
      return { ...v.toJSON(), days_left, is_past, is_urgent };
    });

    return res.json({
      success: true,
      filters: { estado, from, to, vendedor_id, customer_id },
      count: withFlags.length,
      data: withFlags
    });

  } catch (error) {
    console.error('Error en GET /visitas/list:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

/* ...mantén aquí el resto de tus rutas existentes (/planificar, /pendientes, /realizadas, etc.) ... */

module.exports = router;

