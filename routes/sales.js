// routes/invoices.js
'use strict';

const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const { sequelize } = require('../db');
const { QueryTypes } = require('sequelize');
const nodemailer = require('nodemailer');

// MODELOS
const Invoice = require('../models/Invoice'); // PK: invoice_number

let ProductSale = null; // tabla de detalle de productos vendidos
try {
  ProductSale = require('../models/ProductSale');     // singular
} catch (_e1) {
  try {
    ProductSale = require('../models/ProductSales');  // plural
  } catch (_e2) {
    console.warn('[invoices] Modelo ProductSale/ProductSales no disponible. Se omitirá el guardado de detalle.');
  }
}

let Payment = null;
try {
  Payment = require('../models/Payment');
} catch {
  console.warn('[invoices] Modelo Payment no disponible (solo afecta /invoices/pay).');
}

let Vendedor = null;
try {
  Vendedor = require('../models/Vendedor');
} catch {
  console.warn('[invoices] Modelo Vendedor no disponible; el email usará solo vendedor_id.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function absNum(n) {
  const v = Number(n) || 0;
  return Math.abs(v);
}
function safeDate(value, fallback = new Date()) {
  const d = value ? new Date(value) : fallback;
  return Number.isNaN(d.getTime()) ? fallback : d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Email / SMTP (usar variables de entorno)
// ─────────────────────────────────────────────────────────────────────────────
const mailFrom = process.env.MAIL_FROM || process.env.SMTP_USER || 'ventas@example.com';
const mailTo   = process.env.SALES_TO || process.env.MAIL_TO || 'ventas@example.com';

// Derivar secure del puerto para evitar “wrong version number”
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = SMTP_PORT === 465; // 465 => TLS directo, 587 => STARTTLS

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: (process.env.SMTP_USER && process.env.SMTP_PASS)
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
  requireTLS: !SMTP_SECURE,           // Forzar STARTTLS cuando es 587
  tls: {
    minVersion: 'TLSv1.2',
    servername: SMTP_HOST,            // SNI correcto
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LISTAR TODAS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/fetchallsales', async (_req, res) => {
  try {
    await sequelize.authenticate();
    const invoices = await Invoice.findAll({ order: [['date_time', 'DESC']] });
    res.json(invoices);
  } catch (error) {
    console.error('❌ fetchallsales:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FACTURAS POR VENDEDOR (usa vendedor_id)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/invoices/seller/:vendedorId', async (req, res) => {
  try {
    const { vendedorId } = req.params;

    const rows = await Invoice.findAll({
      where: { vendedor_id: vendedorId },
      attributes: {
        include: [
          [sequelize.literal('ABS(total)'), 'abs_total'],
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
      balance: Number(r.balance ?? 0),
    }));

    res.json({ success: true, data: normalized });
  } catch (error) {
    console.error('❌ invoices/seller:', error);
    res.status(500).json({ success: false, error: 'Error al listar facturas del vendedor', details: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CREAR FACTURA
//  - Guarda payment_method ('cash' | 'credit')
//  - Guarda paid_at (si es contado se marca fecha de pago, si es crédito queda null)
//  - Guarda detalle en ProductSales (si el modelo existe)
//  - Envía correo con: vendedor, monto, tipo, cliente, fecha, zona
// Body esperado (flexible en items):
// {
//   invoice_number, date_time, customer_name, total, cash, change,
//   vendedor_id, payment_method, customer_id?, zona?,
//   items|products|cartItems: [ { product_id|id, product_name|name|title, quantity|qty|cantidad, price|unit_price|precio, subtotal? } ]
// }
// ─────────────────────────────────────────────────────────────────────────────
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
      date_time,         // ISO string
      customer_id,
      customer_name,
      total,
      cash,
      change,
      vendedor_id,
      payment_method,    // 'cash' | 'credit'
      zona               // opcional
    } = req.body;

    if (
      invoice_number == null || !date_time || !customer_name ||
      total == null || cash == null || change == null
    ) {
      await t.rollback();
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const method = String(payment_method || 'cash').toLowerCase();
    const dt = safeDate(date_time);
    const absTotal = absNum(total);

    // Si es contado, se paga completo en el acto
    const paidAmount = method === 'cash' ? absTotal : 0;
    const paidAt     = method === 'cash' ? dt : null;

    // Si la tabla tiene 'balance', lo calculamos para crédito
    const updatesIfHave = {};
    if (Invoice.rawAttributes?.balance) {
      updatesIfHave.balance = method === 'credit' ? Math.max(absTotal - paidAmount, 0) : 0;
    }

    // Crear la factura
    const invoice = await Invoice.create({
      invoice_number,
      date_time: dt,
      customer_id: customer_id ?? null,
      customer_name,
      total,                    // puede venir negativo para crédito; mantenemos lo que manda el POS
      cash,
      change,
      vendedor_id: vendedor_id ?? null,
      payment_method: method,   // guardamos el método
      paid_amount: paidAmount,  // contado=total, crédito=0
      paid_at: paidAt,          // fecha del pago (solo contado)
      zona: zona ?? null,       // si existe la columna, Sequelize lo ignorará si no existe
      ...updatesIfHave
    }, { transaction: t });

    // Guardar detalle de productos (si hay items y existe el modelo)
    const rawItems = Array.isArray(req.body.items)
      ? req.body.items
      : Array.isArray(req.body.products)
        ? req.body.products
        : Array.isArray(req.body.cartItems)
          ? req.body.cartItems
          : [];

    if (ProductSale && rawItems.length > 0) {
      // Detectar FK que espera el modelo
      const fkInvoiceId =
        ProductSale.rawAttributes?.invoice_number ? 'invoice_number'
        : ProductSale.rawAttributes?.invoice_id ? 'invoice_id'
        : null;

      const commonCols = {
        ...(ProductSale.rawAttributes?.vendedor_id ? { vendedor_id: vendedor_id ?? null } : {}),
        ...(ProductSale.rawAttributes?.customer_id ? { customer_id: customer_id ?? null } : {})
      };

      const rows = rawItems.map((it, idx) => {
        const product_id   = it.product_id ?? it.id ?? null;
        const product_name = it.product_name ?? it.name ?? it.title ?? '';
        const quantity     = Number(it.quantity ?? it.qty ?? it.cantidad ?? 1);
        const unit_price   = Number(it.price ?? it.unit_price ?? it.precio ?? 0);
        const subtotal     = it.subtotal != null ? Number(it.subtotal) : Number((unit_price * quantity).toFixed(2));

        const base = {
          product_id,
          product_name,
          quantity,
          unit_price,
          subtotal,
          line_number: (idx + 1),
          ...commonCols
        };

        if (fkInvoiceId === 'invoice_number') base.invoice_number = invoice_number;
        else if (fkInvoiceId === 'invoice_id') base.invoice_id = invoice_number; // ajusta si tu FK apunta al ID interno

        return base;
      });

      // Filtra columnas inexistentes para no romper con modelos minimalistas
      const allowed = Object.keys(ProductSale.rawAttributes);
      const sanitizedRows = rows.map(r => {
        const out = {};
        for (const k of Object.keys(r)) {
          if (allowed.includes(k)) out[k] = r[k];
        }
        return out;
      });

      if (sanitizedRows.length > 0) {
        await ProductSale.bulkCreate(sanitizedRows, { transaction: t });
      }
    }

    await t.commit();

    // ── Email (después del commit; si falla, no afecta la venta) ────────────
    (async () => {
      try {
        let vendedorNombre = vendedor_id ? `ID ${vendedor_id}` : 'Sin vendedor';
        let vendedorZona   = zona || null;
        if (Vendedor && vendedor_id) {
          const v = await Vendedor.findByPk(vendedor_id);
          if (v) {
            vendedorNombre = v.nombre || vendedorNombre;
            vendedorZona   = v.zona || vendedorZona;
          }
        }

        if (!transporter) return;

        const tipo = method === 'credit' ? 'CRÉDITO' : 'CONTADO';
        const fechaVenta = dt.toLocaleString('es-DO');
        const asunto = `Nueva venta #${invoice_number} — ${tipo} — RD$ ${absTotal.toFixed(2)}`;
        const html = `
          <div style="font-family:Arial,Helvetica,sans-serif">
            <h3>Nueva venta registrada</h3>
            <ul>
              <li><b>Factura:</b> ${invoice_number}</li>
              <li><b>Fecha:</b> ${fechaVenta}</li>
              <li><b>Cliente:</b> ${customer_name}</li>
              <li><b>Monto:</b> RD$ ${absTotal.toFixed(2)}</li>
              <li><b>Método:</b> ${tipo}</li>
              <li><b>Vendedor:</b> ${vendedorNombre}</li>
              <li><b>Zona:</b> ${vendedorZona ?? '—'}</li>
            </ul>
          </div>
        `;
        await transporter.sendMail({
          from: mailFrom,
          to: mailTo,
          subject: asunto,
          html
        });
      } catch (e) {
        console.warn('[addsale] No se pudo enviar correo:', e?.message);
      }
    })();

    res.status(201).json({ success: true, invoice });
  } catch (error) {
    if (t.finished !== 'commit') await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Número de factura duplicado' });
    }
    console.error('❌ addsale:', error);
    res.status(500).json({ error: 'Error al crear factura', details: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OBTENER POR invoice_number
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// ACTUALIZAR POR invoice_number
//  - si envías payment_method/paid_amount/paid_at también se actualizan
// ─────────────────────────────────────────────────────────────────────────────
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
      vendedor_id, payment_method, paid_amount, paid_at
    } = req.body;

    if (
      date_time == null || customer_name == null ||
      total == null || cash == null || change == null
    ) {
      await t.rollback();
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const updates = {
      date_time: safeDate(date_time),
      customer_name,
      total,
      cash,
      change,
      vendedor_id: vendedor_id ?? invoice.vendedor_id,
      payment_method: payment_method ?? invoice.payment_method,
      paid_amount: paid_amount ?? invoice.paid_amount
    };

    if (paid_at !== undefined) updates.paid_at = paid_at ? safeDate(paid_at) : null;

    // balance si existe
    if (Invoice.rawAttributes?.balance) {
      const method = String(updates.payment_method || '').toLowerCase();
      const absTotal = absNum(updates.total);
      const paid = Number(updates.paid_amount || 0);
      updates.balance = method === 'credit' ? Math.max(absTotal - paid, 0) : 0;
    }

    await invoice.update(updates, { transaction: t });
    await t.commit();
    res.json(invoice);
  } catch (error) {
    if (t.finished !== 'commit') await t.rollback();
    console.error('❌ updatesale:', error);
    res.status(500).json({ error: 'Error al actualizar factura', details: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ELIMINAR POR invoice_number
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRAR PAGO (ABONO) A CRÉDITO
// ─────────────────────────────────────────────────────────────────────────────
router.post('/invoices/pay/:invoice_number', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { invoice_number } = req.params;
    const { amount, at } = req.body;

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      await t.rollback();
      return res.status(400).json({ error: 'Monto inválido' });
    }

    const payAt = safeDate(at, new Date());

    const invoice = await Invoice.findByPk(invoice_number, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!invoice) {
      await t.rollback();
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const method = String(invoice.payment_method || '').toLowerCase();
    if (method !== 'credit') {
      await t.rollback();
      return res.status(400).json({ error: 'La factura no es a crédito' });
    }

    const rawTotal = Number(invoice.total) || 0;
    const absTotal = Math.abs(rawTotal);
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

    // Registrar en Payments (si existe)
    try {
      if (Payment) {
        const payload = { amount: amt };
        if (Payment.rawAttributes?.created_at) payload.created_at = payAt;
        if (Payment.rawAttributes?.paid_at)     payload.paid_at     = payAt;
        if (Payment.rawAttributes?.invoice_id)  payload.invoice_id  = invoice.invoice_number;
        if (Payment.rawAttributes?.invoice_number) payload.invoice_number = invoice.invoice_number;
        if (Payment.rawAttributes?.vendedor_id) payload.vendedor_id = invoice.vendedor_id ?? null;
        if (Payment.rawAttributes?.seller_id)   payload.seller_id   = invoice.vendedor_id ?? null;

        await Payment.create(payload, { transaction: t });
      }
    } catch (e) {
      console.warn('[invoices/pay] No se pudo registrar Payment:', e?.message);
    }

    const newPaid = alreadyPaid + amt;
    const newBalance = Math.max(absTotal - newPaid, 0);

    const updates = { paid_amount: newPaid };
    if (Invoice.rawAttributes?.balance) updates.balance = newBalance;
    if (newBalance === 0) {
      updates.paid_at = payAt;
      if (method === 'credit') updates.total = absTotal; // poner en positivo (consistencia UI)
    }

    await invoice.update(updates, { transaction: t });
    await t.commit();

    return res.json({
      success: true,
      invoice: {
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name,
        payment_method: invoice.payment_method,
        total: (newBalance === 0 && method === 'credit') ? absTotal : Math.abs(Number(invoice.total) || 0),
        paid_amount: newPaid,
        balance: newBalance,
        total_restante: newBalance,
        last_payment_at: payAt.toISOString(),
        paid_at: newBalance === 0 ? payAt.toISOString() : (invoice.paid_at || null),
        date_time: invoice.date_time,
        vendedor_id: invoice.vendedor_id ?? null
      }
    });
  } catch (error) {
    if (t.finished !== 'commit') await t.rollback();
    console.error('❌ invoices/pay:', error);
    res.status(500).json({ success: false, error: 'Error al registrar el pago', details: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ESTADÍSTICAS POR VENDEDOR
// ─────────────────────────────────────────────────────────────────────────────
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
    res.status(500).json({ success: false, error: 'Error al obtener estadísticas de ventas', details: error.message });
  }
});

module.exports = router;
