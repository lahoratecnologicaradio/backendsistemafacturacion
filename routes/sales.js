// routes/invoices.js
const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const { sequelize } = require('../db');
const Invoice = require('../models/Invoice');
const { QueryTypes } = require('sequelize');

// ---------- LISTAR TODAS ----------
router.get('/fetchallsales', async (req, res) => {
  try {
    await sequelize.authenticate();
    const invoices = await Invoice.findAll({ order: [['date_time', 'DESC']] });
    res.json(invoices);
  } catch (error) {
    console.error('❌ fetchallsales:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// ---------- FACTURAS POR VENDEDOR (usa vendedor_id) ----------
router.get('/invoices/seller/:vendedorId', async (req, res) => {
  try {
    const { vendedorId } = req.params;

    const rows = await Invoice.findAll({
      where: { vendedor_id: vendedorId },
      attributes: {
        include: [
          // total absoluto por si guardas negativos para crédito
          [sequelize.literal('ABS(total)'), 'abs_total'],
          // balance solo aplica a crédito
          [
            sequelize.literal(
              "CASE WHEN LOWER(COALESCE(payment_method,''))='credit' " +
              "THEN GREATEST(ABS(total) - COALESCE(paid_amount,0), 0) " +
              "ELSE 0 END"
            ),
            'balance'
          ]
        ]
      },
      order: [['date_time', 'DESC']],
      raw: true
    });

    const normalized = rows.map(r => ({
      ...r,
      total: Number(r.abs_total ?? r.total ?? 0),
      balance: Number(r.balance ?? 0)
    }));

    res.json({ success: true, data: normalized });
  } catch (error) {
    console.error('❌ invoices/seller:', error);
    res.status(500).json({ success: false, error: 'Error al listar facturas del vendedor', details: error.message });
  }
});

// ---------- CREAR ----------
router.post('/addsale', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await t.rollback();
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      invoice_number,
      date_time,
      customer_name,
      total,
      cash,
      change,
      vendedor_id,     // 👈 ahora este
      payment_method   // opcional: 'cash' | 'credit'
    } = req.body;

    if (
      invoice_number == null || !date_time || !customer_name ||
      total == null || cash == null || change == null
    ) {
      await t.rollback();
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const method = (payment_method || 'cash').toLowerCase();

    const invoice = await Invoice.create({
      invoice_number,
      date_time,
      customer_name,
      total,
      cash,
      change,
      vendedor_id: vendedor_id ?? null,
      payment_method: method,
      paid_amount:  method === 'cash' ? Math.abs(total) : 0
    }, { transaction: t });

    await t.commit();
    res.status(201).json(invoice);
  } catch (error) {
    if (t.finished !== 'commit') await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Número de factura duplicado' });
    }
    console.error('❌ addsale:', error);
    res.status(500).json({ error: 'Error al crear factura', details: error.message });
  }
});

// ---------- OBTENER POR invoice_number ----------
router.get('/getsale/:invoice_number', async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.invoice_number);
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
    res.json(invoice);
  } catch (error) {
    console.error('❌ getsale:', error);
    res.status(500).json({ error: 'Error al obtener factura', details: error.message });
  }
});

// ---------- ACTUALIZAR POR invoice_number ----------
router.put('/updatesale/:invoice_number', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const invoice = await Invoice.findByPk(req.params.invoice_number);
    if (!invoice) {
      await t.rollback();
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const {
      date_time, customer_name, total, cash, change,
      vendedor_id, payment_method, paid_amount
    } = req.body;

    if (
      date_time == null || customer_name == null ||
      total == null || cash == null || change == null
    ) {
      await t.rollback();
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    await invoice.update({
      date_time, customer_name, total, cash, change,
      vendedor_id: vendedor_id ?? invoice.vendedor_id,
      payment_method: payment_method ?? invoice.payment_method,
      paid_amount: paid_amount ?? invoice.paid_amount
    }, { transaction: t });

    await t.commit();
    res.json(invoice);
  } catch (error) {
    if (t.finished !== 'commit') await t.rollback();
    console.error('❌ updatesale:', error);
    res.status(500).json({ error: 'Error al actualizar factura', details: error.message });
  }
});

// ---------- ELIMINAR POR invoice_number ----------
router.delete('/deletesale/:invoice_number', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const invoice = await Invoice.findByPk(req.params.invoice_number);
    if (!invoice) {
      await t.rollback();
      return res.status(404).json({ error: 'Factura no encontrada' });
    }
    await Invoice.destroy({ where: { invoice_number: req.params.invoice_number }, transaction: t });
    await t.commit();
    res.json({ success: true, message: 'Factura eliminada correctamente' });
  } catch (error) {
    if (t.finished !== 'commit') await t.rollback();
    console.error('❌ deletesale:', error);
    res.status(500).json({ error: 'Error al eliminar factura', details: error.message });
  }
});

// ---------- REGISTRAR PAGO (ABONO) A CRÉDITO ----------
// ---------- REGISTRAR PAGO (ABONO) A CRÉDITO ----------
router.post('/invoices/pay/:invoice_number', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { invoice_number } = req.params;
    const { amount } = req.body;

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Monto inválido' });
    }

    // Bloqueo fila para evitar carreras
    const invoice = await Invoice.findByPk(invoice_number, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!invoice) {
      await t.rollback();
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const method = String(invoice.payment_method || 'cash').toLowerCase();
    if (method !== 'credit') {
      await t.rollback();
      return res.status(400).json({ error: 'La factura no es a crédito' });
    }

    const absTotal = Math.abs(Number(invoice.total) || 0);
    const alreadyPaid = Number(invoice.paid_amount || 0);
    const currentBalance = Math.max(absTotal - alreadyPaid, 0);

    if (currentBalance <= 0) {
      await t.rollback();
      return res.status(400).json({ error: 'La factura ya está saldada' });
    }
    if (amt > currentBalance) {
      await t.rollback();
      return res.status(400).json({ error: 'El abono excede el balance' });
    }

    // Nuevo acumulado
    const newPaid = alreadyPaid + amt;
    const newBalance = Math.max(absTotal - newPaid, 0);
    const now = new Date();

    // Si existe la tabla/Modelo Payment, registramos el abono
    try {
      if (Payment) {
        const paymentPayload = { amount: amt, created_at: now };

        // Intentar mapear claves posibles sin romper si no existen
        if (Payment.rawAttributes?.invoice_id) {
          paymentPayload.invoice_id = invoice.invoice_number; // o invoice.id si tu FK apunta al ID
        } else if (Payment.rawAttributes?.invoice_number) {
          paymentPayload.invoice_number = invoice.invoice_number;
        }
        if (Payment.rawAttributes?.seller_id) {
          paymentPayload.seller_id = invoice.vendedor_id || invoice.seller_id || null;
        }

        await Payment.create(paymentPayload, { transaction: t });
      }
    } catch (e) {
      // Si falla registrar el Payment, no rompemos la transacción de la factura
      console.warn('[invoices/pay] No se pudo registrar Payment:', e?.message);
    }

    // Armar campos a actualizar en Invoice
    const updates = { paid_amount: newPaid };

    // Si la factura quedó totalmente pagada, setear paid_at
    if (newBalance === 0) {
      updates.paid_at = now;
    }

    // Si tu tabla tiene columna 'balance', actualízala también
    if (Invoice.rawAttributes?.balance) {
      updates.balance = newBalance;
    }

    await invoice.update(updates, { transaction: t });

    await t.commit();

    return res.json({
      success: true,
      invoice: {
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name,
        payment_method: invoice.payment_method,
        total: absTotal,
        paid_amount: newPaid,
        balance: newBalance,
        // útil para UI:
        total_restante: newBalance,
        // fecha del último abono (aunque no esté saldada)
        last_payment_at: now.toISOString(),
        // si quedó saldada, también devolvemos paid_at
        paid_at: newBalance === 0 ? now.toISOString() : (invoice.paid_at || null),
        date_time: invoice.date_time,
        vendedor_id: invoice.vendedor_id
      }
    });
  } catch (error) {
    if (t.finished !== 'commit') await t.rollback();
    console.error('❌ invoices/pay:', error);
    res.status(500).json({ success: false, error: 'Error al registrar el pago', details: error.message });
  }
});

// ---------- ESTADÍSTICAS POR VENDEDOR (usa vendedor_id) ----------
router.post('/vendedor-stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    let where = '';
    const params = [];
    if (startDate && endDate) {
      where = 'WHERE date_time BETWEEN ? AND ?';
      params.push(startDate, endDate + ' 23:59:59');
    } else if (startDate) {
      where = 'WHERE date_time >= ?';
      params.push(startDate);
    } else if (endDate) {
      where = 'WHERE date_time <= ?';
      params.push(endDate + ' 23:59:59');
    }

    const q = `
      SELECT COALESCE(vendedor_id, 0) AS vendedor_id,
             COUNT(invoice_number) AS cantidad_ventas,
             SUM(total) AS total_ventas
      FROM invoices
      ${where}
      GROUP BY COALESCE(vendedor_id, 0)
      ORDER BY total_ventas DESC
    `;
    const data = await sequelize.query(q, { replacements: params, type: QueryTypes.SELECT });
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ vendedor-stats:', error);
    console.error('❌ vendedor-stats:', error);
    console.error('❌ vendedor-stats:', error);
    res.status(500).json({ success: false, error: 'Error al obtener estadísticas de ventas', details: error.message });
  }
});

module.exports = router;
