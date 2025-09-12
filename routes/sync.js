// routes/sync.js
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

const { sequelize } = require('../db');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const { Invoice, Productsale } = require('../models/Report');
const ResultadoVisita = require('../models/ResultadoVisita');
const IdempotencyKey = require('../models/IdempotencyKey');

// (Si tienes auth, colócala aquí)
const requireAuth = (req, res, next) => next();

/**
 * POST /api/sync/bulk
 * Body:
 * {
 *   vendedor_id: 7,
 *   last_sync_at: "2025-09-10T12:00:00Z",
 *   orders: [
 *     {
 *       local_id: "ord_1736701234_9876",         // idempotencia
 *       invoice_number: 202509101234,            // si no viene, se genera
 *       customer_id: 15,
 *       customer_name: "Tienda Don Luis",
 *       date_time: "2025-09-10 10:21:00",
 *       total: 139.78,
 *       cash: 140,
 *       change: 0.22,
 *       products: [
 *         { product_id: 10, product_name:"Galletas", qty:3, s_price:10.00 },
 *         { product_id: 5, product_name:"Refresco", qty:2, s_price:12.50 }
 *       ]
 *     }
 *   ],
 *   visits: [
 *     {
 *       local_id: "visit_1736702000_1234",      // idempotencia
 *       vendedor_id: 7, customer_id: 15,
 *       fecha_visita: "2025-09-10",
 *       interes_cliente: "alto",
 *       probabilidad_venta: "alta",
 *       productos_interes: "Snack, bebidas",
 *       pedido_realizado: true,
 *       monto_potencial: 140,
 *       observaciones: "Factura #202509101234",
 *       proxima_visita: "2025-09-25",
 *       duracion_visita: 45,
 *       hora_realizacion: "10:30:00"
 *     }
 *   ]
 * }
 */
router.post('/bulk', requireAuth, async (req, res) => {
  const {
    vendedor_id,
    last_sync_at,
    orders = [],
    visits = [],
  } = req.body || {};

  // Normaliza last_sync_at
  let lastSyncDate = new Date('1970-01-01T00:00:00Z');
  if (last_sync_at && !Number.isNaN(Date.parse(last_sync_at))) {
    lastSyncDate = new Date(last_sync_at);
  }

  const results = [];

  // --------- Procesar ORDERS con idempotencia + transacción + lock ---------
  for (const ord of orders) {
    const localKey = String(ord?.local_id || '');
    if (!localKey) {
      results.push({ type: 'order', ok: false, error: 'local_id requerido' });
      continue;
    }

    try {
      // ¿Ya procesado?
      const existing = await IdempotencyKey.findOne({ where: { key: localKey } });
      if (existing?.server_id) {
        results.push({ type: 'order', local_id: localKey, ok: true, server_id: existing.server_id });
        continue;
      }

      const out = await sequelize.transaction(async (t) => {
        // Reserva clave idempotente para evitar carreras
        await IdempotencyKey.findOrCreate({
          where: { key: localKey },
          defaults: { type: 'order', server_id: null },
          transaction: t,
        });

        const again = await IdempotencyKey.findOne({ where: { key: localKey }, transaction: t });
        if (again.server_id) {
          return { ok: true, server_id: again.server_id, racedOut: true };
        }

        // Datos de la factura
        const invoice_number = ord.invoice_number || genInvoiceNumber();
        const inv = await Invoice.create({
          invoice_number,
          customer_name: ord.customer_name || '',
          customer_id: ord.customer_id || null,
          vendedor_id: ord.vendedor_id || vendedor_id || null,
          date_time: ord.date_time || new Date(),
          total: Number(ord.total || 0),
          cash: Number(ord.cash || 0),
          change: Number(ord.change || 0),
        }, { transaction: t });

        // Items + descuento de stock con bloqueo de fila
        for (const line of (ord.products || [])) {
          const qty = Number(line.qty || 0);
          const price = Number(line.s_price || 0);
          await Productsale.create({
            invoice_number,
            product_name: line.product_name || '',
            product_id: line.product_id,
            amount: Number((qty * price).toFixed(2)),
            qty,
            price,
          }, { transaction: t });

          const prod = await Product.findOne({
            where: { id: line.product_id },
            transaction: t,
            lock: t.LOCK.UPDATE,         // <-- evita carreras
          });
          if (!prod) throw new Error(`Producto ${line.product_id} no existe`);

          const currentQty = Number(prod.qty || 0);
          const newQty = currentQty - qty;
          await prod.update({ qty: newQty }, { transaction: t });
        }

        // Marca idempotencia
        await IdempotencyKey.update(
          { server_id: inv.id },
          { where: { key: localKey }, transaction: t }
        );

        return { ok: true, server_id: inv.id, invoice_number };
      });

      results.push({ type: 'order', local_id: localKey, ...out });
    } catch (e) {
      results.push({ type: 'order', local_id: localKey, ok: false, error: e.message || String(e) });
    }
  }

  // --------- Procesar VISITS con idempotencia ---------
  for (const v of visits) {
    const localKey = String(v?.local_id || '');
    if (!localKey) {
      results.push({ type: 'visit', ok: false, error: 'local_id requerido' });
      continue;
    }

    try {
      const existing = await IdempotencyKey.findOne({ where: { key: localKey } });
      if (existing?.server_id) {
        results.push({ type: 'visit', local_id: localKey, ok: true, server_id: existing.server_id });
        continue;
      }

      const visit = await sequelize.transaction(async (t) => {
        await IdempotencyKey.findOrCreate({
          where: { key: localKey },
          defaults: { type: 'visit', server_id: null },
          transaction: t,
        });

        const again = await IdempotencyKey.findOne({ where: { key: localKey }, transaction: t });
        if (again.server_id) return { ok: true, server_id: again.server_id, racedOut: true };

        const body = v || {};
        const row = await ResultadoVisita.create({
          vendedor_id: body.vendedor_id || vendedor_id || null,
          customer_id: body.customer_id || null,
          fecha_visita: body.fecha_visita,
          interes_cliente: body.interes_cliente,
          probabilidad_venta: body.probabilidad_venta,
          productos_interes: body.productos_interes,
          pedido_realizado: !!body.pedido_realizado,
          monto_potencial: body.monto_potencial,
          observaciones: body.observaciones,
          proxima_visita: body.proxima_visita,
          duracion_visita: body.duracion_visita,
          hora_realizacion: body.hora_realizacion,
        }, { transaction: t });

        await IdempotencyKey.update(
          { server_id: row.id },
          { where: { key: localKey }, transaction: t }
        );
        return { ok: true, server_id: row.id };
      });

      results.push({ type: 'visit', local_id: localKey, ...visit });
    } catch (e) {
      results.push({ type: 'visit', local_id: localKey, ok: false, error: e.message || String(e) });
    }
  }

  // --------- Cambios (delta) desde last_sync_at ---------
  const changes = { products: [], customers: [], invoices: [] };

  try {
    changes.products = await Product.findAll({
      where: { updatedAt: { [Op.gt]: lastSyncDate } },
      attributes: ['id', 'product_name', 's_price', 'qty', 'updatedAt'],
      order: [['updatedAt', 'ASC']],
    });
  } catch {}

  try {
    changes.customers = await Customer.findAll({
      where: { updatedAt: { [Op.gt]: lastSyncDate } },
      attributes: ['id', 'full_name', 'c_number', 'address', 'updatedAt'],
      order: [['updatedAt', 'ASC']],
    });
  } catch {}

  try {
    if (vendedor_id) {
      changes.invoices = await Invoice.findAll({
        where: {
          vendedor_id,
          updatedAt: { [Op.gt]: lastSyncDate },
        },
        attributes: [
          'id', 'invoice_number', 'vendedor_id', 'customer_id', 'customer_name',
          'total', 'cash', 'change', 'date_time', 'updatedAt'
        ],
        order: [['updatedAt', 'ASC']],
      });
    }
  } catch {}

  return res.json({
    server_time: new Date().toISOString(),
    results,
    changes,
  });
});

// Utilidad para generar invoice_number sencillo
function genInvoiceNumber() {
  const d = new Date();
  const y = d.getFullYear() % 100;      // 2 dígitos
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rnd = Math.floor(Math.random() * 9000) + 1000;
  return Number(`${y}${m}${day}${rnd}`);
}

module.exports = router;
