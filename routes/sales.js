// routes/sales.js
'use strict';

const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const { sequelize } = require('../db');
const { QueryTypes, Op } = require('sequelize');
const nodemailer = require('nodemailer');

// ─────────────────────────────────────────────────────────────────────────────
// MODELOS
// ─────────────────────────────────────────────────────────────────────────────
const Invoice = require('../models/Invoice'); // PK: invoice_number

let ProductSale = null;
try {
  ProductSale = require('../models/ProductSale');     // singular
} catch (_e1) {
  try {
    ProductSale = require('../models/ProductSales');  // plural
  } catch (_e2) {
    console.warn('[sales] Modelo ProductSale/ProductSales no disponible. Se omitirá el guardado de detalle.');
    ProductSale = null;
  }
}

let Payment = null;
try {
  Payment = require('../models/Payment');
} catch {
  console.warn('[sales] Modelo Payment no disponible (solo afecta /invoices/pay).');
  Payment = null;
}

let Vendedor = null;
try {
  Vendedor = require('../models/Vendedor');
} catch {
  console.warn('[sales] Modelo Vendedor no disponible; el email usará solo vendedor_id.');
  Vendedor = null;
}

// Product: UNA sola declaración. El campo de stock ES **qty** (y solo qty).
let Product;
try {
  Product = require('../models/Product');
} catch (e1) {
  try {
    Product = require('../models/Products');
  } catch (e2) {
    try {
      Product = require('../models/Producto');
    } catch (e3) {
      Product = null;
      console.warn('[sales] Modelo Product no disponible; no se actualizará qty.');
    }
  }
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

// Campo de stock (SIEMPRE qty)
const QTY_FIELD = 'qty';

// Umbral de alerta (stock bajo) — configurable por env; default 1000
const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 1000);

// ─────────────────────────────────────────────────────────────────────────────
// Email / SMTP (usar variables de entorno) — configuración TLS
// ─────────────────────────────────────────────────────────────────────────────
const mailFrom = process.env.MAIL_FROM || process.env.SMTP_USER || 'ventas@example.com';
// Fallback si no hay registro en DB:
const FALLBACK_MAIL_TO = process.env.SALES_TO || process.env.MAIL_TO || null;

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = SMTP_PORT === 465; // 465 => TLS directo; 587 => STARTTLS

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: (process.env.SMTP_USER && process.env.SMTP_PASS)
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
  requireTLS: !SMTP_SECURE,
  tls: {
    minVersion: 'TLSv1.2',
    servername: SMTP_HOST,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Obtiene el correo de destino desde la tabla `correo_configuracion` (SIN activo).
// Devuelve el último registro por id. Si no hay, retorna null para que el caller
// decida el fallback.
// ─────────────────────────────────────────────────────────────────────────────
async function getSalesEmailToFromDB() {
  try {
    const rows = await sequelize.query(
      `SELECT correo
         FROM correo_configuracion
        ORDER BY id DESC
        LIMIT 1`,
      { type: QueryTypes.SELECT }
    );
    const correo = rows?.[0]?.correo ? String(rows[0].correo).trim() : null;
    if (correo) return correo;
    console.warn('[sales] No hay registros en correo_configuracion.');
    return null;
  } catch (e) {
    console.warn('[sales] Error consultando correo_configuracion:', e?.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper para construir filas de productsales EXACTAMENTE con:
// invoice_number, product_id, product_name, price, qty, discount, amount
// ─────────────────────────────────────────────────────────────────────────────
function buildProductSalesRows(invoiceNumber, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];
  return rawItems.map((it) => {
    const product_id   = it.product_id ?? it.productId ?? it.id ?? null;
    const product_name = it.product_name ?? it.name ?? it.title ?? '';
    const qty          = Number(it.qty ?? it.quantity ?? it.cantidad ?? 0) || 0;
    const price        = Number(it.price ?? it.unit_price ?? it.precio ?? 0) || 0;
    const discount     = Number(it.discount ?? it.descuento ?? 0) || 0;
    const amount       = (it.amount != null)
      ? Number(it.amount)
      : Number((price * qty - discount).toFixed(2));

    return {
      invoice_number: invoiceNumber,
      product_id,
      product_name,
      price,
      qty,
      discount,
      amount
    };
  }).filter(r => r.product_id != null && r.qty > 0);
}

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
// CREAR FACTURA + guardar detalle productsales + actualizar qty + email
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

    // contado => pagado completo
    const paidAmount = method === 'cash' ? absTotal : 0;
    const paidAt     = method === 'cash' ? dt : null;

    const updatesIfHave = {};
    if (Invoice.rawAttributes?.balance) {
      updatesIfHave.balance = method === 'credit' ? Math.max(absTotal - paidAmount, 0) : 0;
    }

    // 1) Crear factura
    const invoice = await Invoice.create({
      invoice_number,
      date_time: dt,
      customer_id: customer_id ?? null,
      customer_name,
      total,
      cash,
      change,
      vendedor_id: vendedor_id ?? null,
      payment_method: method,
      paid_amount: paidAmount,
      paid_at: paidAt,
      zona: zona ?? null,
      ...updatesIfHave
    }, { transaction: t });

    // 2) Obtener items de la venta (admite varias claves)
    const rawItems = Array.isArray(req.body.items)
      ? req.body.items
      : Array.isArray(req.body.products)
        ? req.body.products
        : Array.isArray(req.body.cartItems)
          ? req.body.cartItems
          : [];

    // Guardaremos info para el correo y actualización de inventario
    const itemsWithQty = [];

    // 3) Guardar detalle en productsales (si existe el modelo)
    if (ProductSale && rawItems.length > 0) {
      try {
        const rows = buildProductSalesRows(invoice_number, rawItems);
        if (rows.length > 0) {
          await ProductSale.bulkCreate(rows, { transaction: t });
        }
      } catch (e) {
        console.warn('[addsale] No se pudo guardar productsales:', e?.message);
      }
    }

    // 4) Descontar **qty** del inventario (SOLO `qty`)
    if (!Product) {
      console.warn('[sales/addsale] No hay modelo Product; se omite actualización de qty.');
    } else if (!Product.rawAttributes?.[QTY_FIELD]) {
      console.warn(`[sales/addsale] El modelo Product no tiene el campo '${QTY_FIELD}'. Revisa el modelo/DB.`);
    } else {
      for (const it of rawItems) {
        const product_id   = it.product_id ?? it.productId ?? it.id ?? null;
        const product_name = it.product_name ?? it.name ?? it.title ?? `ID ${product_id}`;
        const quantity     = Math.max(0, Number(it.quantity ?? it.qty ?? it.cantidad ?? 0) || 0);
        const unit_price   = Number(it.price ?? it.unit_price ?? it.precio ?? 0);
        const discount     = Number(it.discount ?? 0) || 0;
        const subtotal     = (it.amount != null)
          ? Number(it.amount)
          : Number((unit_price * quantity - discount).toFixed(2));

        let qtyBefore = null;
        let qtyAfter  = null;

        if (product_id == null) {
          console.warn('[sales/addsale] Ítem sin product_id/id/productId; no se puede actualizar qty.', it);
        } else if (quantity <= 0) {
          console.warn(`[sales/addsale] Cantidad <= 0 para producto ${product_id}; no se descuenta qty.`);
        } else {
          const beforeRow = await Product.findByPk(product_id, {
            attributes: ['id', 'product_name', QTY_FIELD],
            transaction: t
          });

          if (!beforeRow) {
            console.warn(`[sales/addsale] Producto id=${product_id} no encontrado; no se actualiza qty.`);
          } else {
            qtyBefore = Number(beforeRow.get(QTY_FIELD)) || 0;

            const [affected] = await Product.update(
              { [QTY_FIELD]: sequelize.literal(`CASE WHEN ${QTY_FIELD} >= ${quantity} THEN ${QTY_FIELD} - ${quantity} ELSE 0 END`) },
              { where: { id: product_id }, transaction: t }
            );

            if (affected === 0) {
              console.warn(`[sales/addsale] UPDATE no afectó filas (id=${product_id}). Verifica que exista y no esté soft-deleted.`);
            }

            const afterRow = await Product.findByPk(product_id, {
              attributes: ['id', 'product_name', QTY_FIELD],
              transaction: t
            });
            qtyAfter = afterRow ? (Number(afterRow.get(QTY_FIELD)) || 0) : null;

            console.log(`[sales/addsale] Producto ${product_id} — qty: ${qtyBefore} -> ${qtyAfter} (venta: ${quantity})`);
          }
        }

        itemsWithQty.push({
          product_id,
          product_name,
          quantity,
          unit_price,
          subtotal,
          qty_before: qtyBefore,
          qty_after: qtyAfter
        });
      }
    }

    // 5) Commit
    await t.commit();

    // 6) Correo (no afecta la venta si falla)
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

        const tipo       = method === 'credit' ? 'CRÉDITO' : 'CONTADO';
        const tipoAsunto = method === 'credit' ? 'crédito' : 'contado';
        const fechaVenta = dt.toLocaleString('es-DO');

        const formatoRD = new Intl.NumberFormat('es-DO', {
          style: 'currency',
          currency: 'DOP',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const montoAsunto = formatoRD.format(absTotal);
        const asunto = `El vendedor ${vendedorNombre} ha realizado una venta ${tipoAsunto} al cliente ${customer_name} por un monto de ${montoAsunto}`;

        const rowsHtml = (itemsWithQty || []).map(it => {
          const price = formatoRD.format(Number(it.unit_price || 0));
          const sub   = formatoRD.format(Number(it.subtotal || 0));
          const before = (it.qty_before == null) ? '—' : Number(it.qty_before).toLocaleString('es-DO');
          const after  = (it.qty_after  == null) ? '—' : Number(it.qty_after).toLocaleString('es-DO');

          return `
            <tr>
              <td>${it.product_name}</td>
              <td style="text-align:right;">${Number(it.quantity || 0).toLocaleString('es-DO')}</td>
              <td style="text-align:right;">${price}</td>
              <td style="text-align:right;">${sub}</td>
              <td style="text-align:right;">${before}</td>
              <td style="text-align:right;"><b>${after}</b></td>
            </tr>
          `;
        }).join('');

        const html = `
          <div style="font-family:Arial,Helvetica,sans-serif; color:#222;">
            <h3 style="margin:0 0 6px;">Nueva venta registrada</h3>
            <ul style="margin:0 0 12px 18px; padding:0; line-height:1.4;">
              <li><b>Factura:</b> ${invoice_number}</li>
              <li><b>Fecha:</b> ${fechaVenta}</li>
              <li><b>Cliente:</b> ${customer_name}</li>
              <li><b>Monto:</b> ${montoAsunto}</li>
              <li><b>Método:</b> ${tipo}</li>
              <li><b>Vendedor:</b> ${vendedorNombre}</li>
              <li><b>Zona:</b> ${vendedorZona ?? '—'}</li>
            </ul>
            <h4 style="margin:16px 0 8px;">Detalle de productos</h4>
            <table cellpadding="6" cellspacing="0" style="width:100%; border-collapse:collapse; font-size:13px;">
              <thead>
                <tr style="background:#f5f5f5;">
                  <th style="text-align:left;">Producto</th>
                  <th style="text-align:right;">Cant.</th>
                  <th style="text-align:right;">Precio</th>
                  <th style="text-align:right;">Subtotal</th>
                  <th style="text-align:right;">Qty antes</th>
                  <th style="text-align:right;">Qty después</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || `<tr><td colspan="6" style="text-align:center;color:#777;">(Sin detalle)</td></tr>`}
              </tbody>
            </table>
          </div>
        `;

        // 1) Intentar leer desde DB
        let mailToRuntime = await getSalesEmailToFromDB();

        // 2) Fallbacks si la DB no devolvió nada usable
        if (!mailToRuntime || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mailToRuntime)) {
          console.warn(`[sales/addsale] Correo DB inválido o ausente (${mailToRuntime}). Usando fallback de env.`);
          mailToRuntime = FALLBACK_MAIL_TO || mailFrom; // último recurso: remite a from
        }

        console.log(`[sales/addsale] Enviando email de venta a: ${mailToRuntime}`);

        await transporter.sendMail({
          from: mailFrom,
          to: mailToRuntime,
          subject: asunto,
          html
        });
      } catch (e) {
        console.warn('[sales/addsale] No se pudo enviar correo:', e?.message);
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

    if (Invoice.rawAttributes?.balance) {
      const method = String(updates.payment_method || '').toLowerCase();
      const absTotal = absNum(updates.total);
      const paid = Number(updates.paid_amount || 0);
      updates.balance = method === 'credit' ? Math.max(absTotal - paid, 0) : 0;
    }

    await invoice.update(updates, { transaction: t });

    // Reemplazar detalle si llegan items/products/cartItems
    try {
      const rawItems = Array.isArray(req.body.items)
        ? req.body.items
        : Array.isArray(req.body.products)
          ? req.body.products
          : Array.isArray(req.body.cartItems)
            ? req.body.cartItems
            : [];

      if (ProductSale && rawItems.length > 0) {
        await ProductSale.destroy({
          where: { invoice_number: invoice.invoice_number },
          transaction: t
        });

        const rows = buildProductSalesRows(invoice.invoice_number, rawItems);
        if (rows.length > 0) {
          await ProductSale.bulkCreate(rows, { transaction: t });
        }
      }
    } catch (e) {
      console.warn('[updatesale] No se pudo reemplazar productsales:', e?.message);
    }

    await t.commit();
    res.json(invoice);
  } catch (error) {
    if (t.finished !== 'commit') await t.rollback();
    console.error('❌ updatesale:', error);
    res.status(500).json({ error: 'Error al actualizar factura', details: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ELIMINAR POR invoice_number (borra también el detalle productsales)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/deletesale/:invoice_number', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const invoice = await Invoice.findByPk(req.params.invoice_number);
    if (!invoice) {
      await t.rollback();
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    if (ProductSale) {
      try {
        await ProductSale.destroy({
          where: { invoice_number: req.params.invoice_number },
          transaction: t
        });
      } catch (e) {
        console.warn('[deletesale] No se pudo borrar productsales:', e?.message);
      }
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
      console.warn('[sales/invoices/pay] No se pudo registrar Payment:', e?.message);
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

// ─────────────────────────────────────────────────────────────────────────────
// VENTAS DE UN DÍA ESPECÍFICO
// ─────────────────────────────────────────────────────────────────────────────
router.get(['/by-day', '/day/:date'], async (req, res) => {
  try {
    const dateStr = (req.query.date || req.params.date || '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({
        success: false,
        error: "Parámetro 'date' inválido. Formato esperado: YYYY-MM-DD"
      });
    }

    const start = new Date(`${dateStr}T00:00:00.000`);
    const end   = new Date(`${dateStr}T23:59:59.999`);

    const vendedorId = req.query.vendedor_id != null ? String(req.query.vendedor_id).trim() : null;

    const paramsAgg = [start, end];
    let whereAgg = 'WHERE date_time BETWEEN ? AND ?';
    if (vendedorId) {
      whereAgg += ' AND COALESCE(vendedor_id, 0) = ?';
      paramsAgg.push(vendedorId);
    }

    const aggSql = `
      SELECT
        COUNT(*)                                                AS cantidad_facturas,
        SUM(ABS(COALESCE(total,0)))                             AS total_ventas,
        SUM(CASE WHEN LOWER(COALESCE(payment_method,''))='cash'
                 THEN ABS(COALESCE(total,0)) ELSE 0 END)        AS total_contado,
        SUM(CASE WHEN LOWER(COALESCE(payment_method,''))='credit'
                 THEN ABS(COALESCE(total,0)) ELSE 0 END)        AS total_credito,
        SUM(COALESCE(paid_amount,0))                            AS total_pagado,
        SUM(CASE WHEN LOWER(COALESCE(payment_method,''))='credit'
                 THEN GREATEST(ABS(COALESCE(total,0)) - COALESCE(paid_amount,0), 0)
                 ELSE 0 END)                                    AS balance_pendiente
      FROM invoices
      ${whereAgg}
    `;

    const [agg] = await sequelize.query(aggSql, {
      replacements: paramsAgg,
      type: QueryTypes.SELECT
    });

    const whereList = { date_time: { [Op.between]: [start, end] } };
    if (vendedorId) whereList.vendedor_id = vendedorId;

    const rows = await Invoice.findAll({
      where: whereList,
      order: [['date_time', 'DESC']],
      attributes: {
        include: [
          [sequelize.literal('ABS(COALESCE(total,0))'), 'abs_total'],
          [
            sequelize.literal(
              "CASE WHEN LOWER(COALESCE(payment_method,''))='credit' " +
              "THEN GREATEST(ABS(COALESCE(total,0)) - COALESCE(paid_amount,0), 0) " +
              "ELSE 0 END"
            ),
            'balance'
          ]
        ]
      },
      raw: true
    });

    const facturas = rows.map(r => ({
      ...r,
      total: Number(r.abs_total ?? r.total ?? 0),
      balance: Number(r.balance ?? 0)
    }));

    const paramsVend = [start, end];
    let whereVend = 'WHERE date_time BETWEEN ? AND ?';
    if (vendedorId) {
      whereVend += ' AND COALESCE(vendedor_id, 0) = ?';
      paramsVend.push(vendedorId);
    }
    const bySellerSql = `
      SELECT
        COALESCE(vendedor_id, 0)                                AS vendedor_id,
        COUNT(invoice_number)                                   AS cantidad_ventas,
        SUM(ABS(COALESCE(total,0)))                             AS total_ventas,
        SUM(CASE WHEN LOWER(COALESCE(payment_method,''))='cash'
                 THEN ABS(COALESCE(total,0)) ELSE 0 END)        AS total_contado,
        SUM(CASE WHEN LOWER(COALESCE(payment_method,''))='credit'
                 THEN ABS(COALESCE(total,0)) ELSE 0 END)        AS total_credito,
        SUM(COALESCE(paid_amount,0))                            AS total_pagado,
        SUM(CASE WHEN LOWER(COALESCE(payment_method,''))='credit'
                 THEN GREATEST(ABS(COALESCE(total,0)) - COALESCE(paid_amount,0), 0)
                 ELSE 0 END)                                    AS balance_pendiente
      FROM invoices
      ${whereVend}
      GROUP BY COALESCE(vendedor_id, 0)
      ORDER BY total_ventas DESC
    `;
    const breakdown = await sequelize.query(bySellerSql, {
      replacements: paramsVend,
      type: QueryTypes.SELECT
    });

    return res.json({
      success: true,
      date: dateStr,
      filter: { vendedor_id: vendedorId ?? null },
      summary: {
        cantidad_facturas: Number(agg?.cantidad_facturas || 0),
        total_ventas: Number(agg?.total_ventas || 0),
        total_contado: Number(agg?.total_contado || 0),
        total_credito: Number(agg?.total_credito || 0),
        total_pagado: Number(agg?.total_pagado || 0),
        balance_pendiente: Number(agg?.balance_pendiente || 0)
      },
      by_seller: breakdown,
      invoices: facturas
    });
  } catch (error) {
    console.error('❌ sales/by-day:', error);
    res.status(500).json({ success: false, error: 'Error al obtener ventas del día', details: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ÚLTIMOS N PEDIDOS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/invoices/latest', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 5, 50));

    const rows = await Invoice.findAll({
      order: [['date_time', 'DESC']],
      limit,
      attributes: {
        include: [
          [sequelize.literal('ABS(COALESCE(total,0))'), 'abs_total']
        ]
      },
      raw: true
    });

    let vendedorById = {};
    try {
      if (Vendedor) {
        const ids = [...new Set(rows.map(r => r.vendedor_id).filter(v => v != null))];
        if (ids.length > 0) {
          const vendedores = await Vendedor.findAll({
            where: { id: ids },
            attributes: ['id', 'nombre'],
            raw: true
          });
          vendedorById = Object.fromEntries(vendedores.map(v => [v.id, v.nombre]));
        }
      }
    } catch (e) {
      console.warn('[invoices/latest] No se pudo cargar Vendedor:', e?.message);
    }

    const data = rows.map(r => {
      const method = String(r.payment_method || 'cash').toLowerCase();
      const total = Number(r.abs_total ?? r.total ?? 0);
      const paid  = Number(r.paid_amount || 0);
      const balance = method === 'credit' ? Math.max(total - paid, 0) : 0;

      let estado_credito = 'contado';
      if (method === 'credit') {
        estado_credito = balance <= 0 ? 'crédito pagado' : 'crédito pendiente';
      }

      return {
        invoice_number: r.invoice_number,
        date_time: r.date_time,
        customer_name: r.customer_name,
        vendedor_id: r.vendedor_id ?? null,
        vendedor_nombre: vendedorById[r.vendedor_id]
          ?? (r.vendedor_id ? `ID ${r.vendedor_id}` : null),
        payment_method: method,
        total,
        paid_amount: paid,
        balance,
        estado_credito
      };
    });

    res.json({ success: true, limit, data });
  } catch (error) {
    console.error('❌ invoices/latest:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener los últimos pedidos',
      details: error.message
    });
  }
});

module.exports = router;


