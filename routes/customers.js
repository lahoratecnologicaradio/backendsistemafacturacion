// routes/customers.js
const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const { sequelize } = require('../db');
const Customer = require('../models/Customer');

/* ----------------------- helpers ----------------------- */
const toNullIfEmpty = (v) => (v === '' || v === undefined ? null : v);

/** Construye payload de creación.
 *  - Rellena con null si vienen vacíos.
 *  - Mapea contact_name -> contacto si llega con ese alias.
 */
function buildCreatePayload(body = {}) {
  return {
    full_name: toNullIfEmpty(body.full_name),
    product_name: toNullIfEmpty(body.product_name),
    address: toNullIfEmpty(body.address),
    c_number: toNullIfEmpty(body.c_number),
    note: toNullIfEmpty(body.note),
    total: toNullIfEmpty(body.total),
    due_date: toNullIfEmpty(body.due_date),
    vendedor_id:
      body.vendedor_id === undefined || body.vendedor_id === ''
        ? null
        : body.vendedor_id,
    // Campos nuevos
    rnc: toNullIfEmpty(body.rnc),
    contacto: toNullIfEmpty(body.contacto ?? body.contact_name),
  };
}

/** Construye payload de actualización.
 *  - SOLO incluye campos presentes en el body (no pisa con null si no viene).
 *  - Mapea contact_name -> contacto si llega con ese alias.
 */
function buildUpdatePayload(body = {}) {
  const out = {};
  const setIfPresent = (key, val) => {
    if (val !== undefined) out[key] = toNullIfEmpty(val);
  };

  setIfPresent('full_name', body.full_name);
  setIfPresent('product_name', body.product_name);
  setIfPresent('address', body.address);
  setIfPresent('c_number', body.c_number);
  setIfPresent('note', body.note);
  setIfPresent('total', body.total);
  setIfPresent('due_date', body.due_date);

  if (body.vendedor_id !== undefined) {
    out.vendedor_id = body.vendedor_id === '' ? null : body.vendedor_id;
  }

  // Campos nuevos
  setIfPresent('rnc', body.rnc);
  if (body.contacto !== undefined || body.contact_name !== undefined) {
    out.contacto = toNullIfEmpty(body.contacto ?? body.contact_name);
  }

  return out;
}
/* ------------------------------------------------------ */

// ROUTE-1: Obtener todos los clientes
router.get('/fetchallcustomers', async (req, res) => {
  try {
    console.log('🔍 Iniciando fetchallcustomers...');
    await sequelize.authenticate();
    console.log('✅ Conexión a BD exitosa');

    // Si quieres ver tablas (debug):
    // const tables = await sequelize.getQueryInterface().showAllTables();
    // console.log('📊 Tablas en la BD:', tables);

    // Trae todos los campos del modelo, incluidos rnc y contacto (si el modelo ya los tiene)
    const customers = await Customer.findAll({
      order: [['full_name', 'ASC']],
    });
    console.log(`✅ ${customers.length} clientes encontrados`);

    res.json(customers);
  } catch (error) {
    console.error('❌ ERROR REAL:', error.message);
    console.error('📌 STACK:', error.stack);
    console.error('🔍 CÓDIGO:', error.code);
    console.error('📋 ERRNO:', error.errno);

    res.status(500).json({
      error: 'Internal Server Error',
      details: error.message,
      code: error.code,
    });
  }
});

// ROUTE-2: Obtener clientes por ID del vendedor
router.get('/vendedor/:vendedor_id', async (req, res) => {
  try {
    const { vendedor_id } = req.params;

    console.log(`🔍 Buscando clientes del vendedor ID: ${vendedor_id}`);

    if (!vendedor_id) {
      return res.status(400).json({
        success: false,
        message: 'ID del vendedor es requerido',
      });
    }

    const clientes = await Customer.findAll({
      where: { vendedor_id },
      order: [['full_name', 'ASC']],
    });

    console.log(`✅ ${clientes.length} clientes encontrados para el vendedor ${vendedor_id}`);

    res.json({
      success: true,
      count: clientes.length,
      data: clientes,
    });
  } catch (error) {
    console.error('❌ Error al buscar clientes por vendedor:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null,
    });
  }
});

// ROUTE-3: Agregar nuevo cliente
router.post('/addcustomer', async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // (mantén validaciones que tengas definidas en middlewares)
      return res.status(400).json({ errors: errors.array() });
    }

    const payload = buildCreatePayload(req.body);
    const customer = await Customer.create(payload);
    res.status(201).json(customer);
  } catch (error) {
    console.error('Error al crear cliente:', error);
    res.status(500).json({
      error: 'Error al crear cliente',
      details: process.env.NODE_ENV === 'development' ? error.message : null,
    });
  }
});

// ROUTE-4: Actualizar cliente
router.put('/updatecustomer/:id', async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const updates = buildUpdatePayload(req.body);
    await customer.update(updates);
    res.json(customer);
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    res.status(500).json({
      error: 'Error al actualizar cliente',
      details: process.env.NODE_ENV === 'development' ? error.message : null,
    });
  }
});

// ROUTE-5: Eliminar cliente
router.delete('/deletecustomer/:id', async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    await customer.destroy();
    res.json({ success: true, message: 'Cliente eliminado' });
  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    res.status(500).json({
      error: 'Error al eliminar cliente',
      details: process.env.NODE_ENV === 'development' ? error.message : null,
    });
  }
});

module.exports = router;
