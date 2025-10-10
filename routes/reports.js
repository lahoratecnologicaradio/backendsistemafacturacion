// routes/reports.js
'use strict';

const express = require('express');
const router = express.Router();
const { Op, fn, literal, QueryTypes } = require('sequelize');
const { sequelize } = require('../db');

// Modelos empaquetados para reportes
const { Invoice, Productsale } = require('../models/Report');

/* ============================
 * Helpers de fecha (zona RD)
 * ============================ */

// Fecha YYYY-MM-DD en RD (America/Santo_Domingo)
function ymdRD(date = new Date()) {
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Santo_Domingo' }));
  const y = tzDate.getFullYear();
  const m = String(tzDate.getMonth() + 1).padStart(2, '0');
  const d = String(tzDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Límites del día (inicio y fin) en RD como Date con offset -04:00
function rdDayBounds(date = new Date()) {
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Santo_Domingo' }));
  const y = tzDate.getFullYear();
  const m = String(tzDate.getMonth() + 1).padStart(2, '0');
  const d = String(tzDate.getDate()).padStart(2, '0');
  const start = new Date(`${y}-${m}-${d}T00:00:00-04:00`);
  const end   = new Date(`${y}-${m}-${d}T23:59:59.999-04:00`);
  return { start, end };
}

// Rango RD inclusivo a partir de ?start, ?end (YYYY-MM-DD). Si no se envía, usa hoy RD.
function rdRangeFromParams(startStr, endStr) {
  const now = new Date();
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Santo_Domingo' }));
  const y = tzNow.getFullYear();
  const m = String(tzNow.getMonth() + 1).padStart(2, '0');
  const d = String(tzNow.getDate()).padStart(2, '0');
  const todayYMD = `${y}-${m}-${d}`;

  const s = (startStr || todayYMD);
  const e = (endStr   || s);

  const startDate = new Date(`${s}T00:00:00-04:00`);
  const endDate   = new Date(`${e}T23:59:59.999-04:00`);
  return { startDate, endDate, startYMD: s, endYMD: e };
}

const n = (v) => Number(v || 0);

/* =========================================
 * GET /api/reports/today?withProducts=0|1
 * Lista de facturas del día RD
 * ========================================= */
router.get('/today', async (req, res) => {
  try {
    const { start, end } = rdDayBounds(new Date());
    const withProducts = req.query.withProducts !== '0';

    const invoices = await Invoice.findAll({
      where: { date_time: { [Op.between]: [start, end] } },
      order: [['date_time', 'DESC']],
      include: withProducts ? [{ model: Productsale, required: false }] : []
    });

    res.json({
      success: true,
      date: ymdRD(),
      count: invoices.length,
      data: invoices
    });
  } catch (error) {
    console.error('GET /api/reports/today error:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

/* =========================================================
 * GET /api/reports/summary-today
 * Resumen del día RD:
 *  - Totales general/contado/crédito (crédito en positivo)
 *  - Totales por vendedor
 *  - Totales por producto (qty y amount)
 * ========================================================= */
router.get('/summary-today', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { start, end } = rdDayBounds(new Date());

    const invoices = await Invoice.findAll({
      where: { date_time: { [Op.between]: [start, end] } },
      raw: true,
      transaction: t
    });

    let total_general = 0;
    let total_contado = 0;
    let total_credito = 0;
    const bySeller = new Map();

    invoices.forEach(inv => {
      const totalAbs = Math.abs(Number(inv.total) || 0);
      const method = String(inv.payment_method || '').toLowerCase();
      const vid = inv.vendedor_id || 0;

      total_general += totalAbs;
      if (method === 'credit') total_credito += totalAbs;
      else total_contado += totalAbs;

      if (!bySeller.has(vid)) {
        bySeller.set(vid, { vendedor_id: vid, cantidad: 0, total_general: 0, total_contado: 0, total_credito: 0 });
      }
      const agg = bySeller.get(vid);
      agg.cantidad += 1;
      agg.total_general += totalAbs;
      if (method === 'credit') agg.total_credito += totalAbs; else agg.total_contado += totalAbs;
    });

    const productRows = await Productsale.findAll({
      include: [{
        model: Invoice,
        required: true,
        where: { date_time: { [Op.between]: [start, end] } },
        attributes: []
      }],
      attributes: [
        'product_id',
        'product_name',
        [sequelize.fn('SUM', sequelize.col('qty')), 'qty_total'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'amount_total']
      ],
      group: ['product_id', 'product_name'],
      raw: true,
      transaction: t
    });

    await t.commit();

    res.json({
      success: true,
      date: ymdRD(),
      resumen: {
        total_general: Number(total_general.toFixed(2)),
        total_contado: Number(total_contado.toFixed(2)),
        total_credito: Number(total_credito.toFixed(2))
      },
      total_por_vendedor: Array.from(bySeller.values()).map(v => ({
        vendedor_id: v.vendedor_id,
        cantidad: v.cantidad,
        total_general: Number(v.total_general.toFixed(2)),
        total_contado: Number(v.total_contado.toFixed(2)),
        total_credito: Number(v.total_credito.toFixed(2))
      })),
      total_por_producto: productRows.map(r => ({
        product_id: r.product_id,
        product_name: r.product_name,
        qty_total: Number(r.qty_total),
        amount_total: Number(parseFloat(r.amount_total || 0).toFixed(2))
      }))
    });
  } catch (error) {
    if (t.finished !== 'commit') await t.rollback();
    console.error('GET /api/reports/summary-today error:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

/* =========================================================
 * GET /api/reports/salesreport?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Reporte simple (versión original)
 * ========================================================= */
router.get('/salesreport', async (req, res) => {
  try {
    const { from, to } = req.query;

    let whereCondition = {};
    if (from && to) {
      const startDate = new Date(from);
      const endDate = new Date(to);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
      whereCondition = {
        date_time: {
          [Op.between]: [startDate, new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1)]
        }
      };
    } else if (from || to) {
      return res.status(400).json({ error: "Both 'from' and 'to' parameters are required, or omit both" });
    }

    const reports = await Invoice.findAll({
      attributes: ['invoice_number','date_time','customer_name','customer_id','vendedor_id','total','cash','change'],
      where: whereCondition,
      order: [['date_time', 'DESC']],
      raw: true
    });

    res.json(reports);
  } catch (error) {
    console.error('Error fetching sales report:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/* =========================================================
 * GET /api/reports/fetchproductswithinvoicenumber/:invoice_number
 * Productos por factura
 * ========================================================= */
router.get('/fetchproductswithinvoicenumber/:invoice_number', async (req, res) => {
  try {
    const { invoice_number } = req.params;
    const products = await Productsale.findAll({ where: { invoice_number } });
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/* =========================================================
 * POST /api/reports/addreport
 * Alta de reporte (factura + detalle) — versión original
 * ========================================================= */
router.post('/addreport', async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      invoice_number,
      customer_name,
      customer_id,
      vendedor_id,
      date_time,
      products,
      total,
      cash,
      change
    } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Products should be a non-empty array' });
    }

    const invoice = await Invoice.create({
      invoice_number, customer_name, customer_id, vendedor_id, date_time, total, cash, change
    }, { transaction });

    const productData = products.map(p => ({
      invoice_number,
      product_name: p.product_name,
      product_id: p.product_id,
      amount: p.t_price,
      qty: p.qty,
      price: p.s_price
    }));

    const productsale = await Productsale.bulkCreate(productData, { transaction });

    await transaction.commit();
    res.json({ success: true, invoice, productsale });
  } catch (error) {
    await transaction.rollback();
    console.error('Error adding report:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/* =========================================================
 * GET /api/reports/sales?start=YYYY-MM-DD&end=YYYY-MM-DD&vendedor_id=##
 * Reporte integral:
 *  - Ventas por vendedor
 *  - Egresos (total, por día, por vendedor)
 *  - COGS (total y por vendedor)
 *  - Ganancias y netos por vendedor
 * ========================================================= */
router.get('/sales', async (req, res) => {
  try {
    const { start, end, vendedor_id } = req.query;
    const { startDate, endDate, startYMD, endYMD } = rdRangeFromParams(start, end);

    // Filtro base de facturas
    const whereBase = { date_time: { [Op.between]: [startDate, endDate] } };
    if (vendedor_id) whereBase.vendedor_id = Number(vendedor_id);

    // ---------- Ventas por vendedor (totales en positivo) ----------
    const byVendorRows = await Invoice.findAll({
      attributes: [
        'vendedor_id',
        [fn('COUNT', literal('*')), 'cantidad'],
        [fn('SUM', literal('ABS(COALESCE(total,0))')), 'total_general'],
        [fn('SUM', literal(`CASE WHEN LOWER(COALESCE(payment_method,''))='credit' THEN ABS(COALESCE(total,0)) ELSE 0 END`)), 'total_credito'],
        [fn('SUM', literal(`CASE WHEN LOWER(COALESCE(payment_method,''))='credit' THEN 0 ELSE ABS(COALESCE(total,0)) END`)), 'total_contado'],
      ],
      where: whereBase,
      group: ['vendedor_id'],
      raw: true
    });

    // ---------- Totales globales ventas ----------
    const totalsRow = await Invoice.findOne({
      attributes: [
        [fn('COUNT', literal('*')), 'countSales'],
        [fn('SUM', literal('ABS(COALESCE(total,0))')), 'grandTotal'],
        [fn('SUM', literal(`CASE WHEN LOWER(COALESCE(payment_method,''))='credit' THEN 0 ELSE ABS(COALESCE(total,0)) END`)), 'total_contado'],
        [fn('SUM', literal(`CASE WHEN LOWER(COALESCE(payment_method,''))='credit' THEN ABS(COALESCE(total,0)) ELSE 0 END`)), 'total_credito'],
      ],
      where: whereBase,
      raw: true
    });

    const countSales    = n(totalsRow?.countSales);
    const grandTotal    = Number(n(totalsRow?.grandTotal).toFixed(2));
    const totalContado  = Number(n(totalsRow?.total_contado).toFixed(2));
    const totalCredito  = Number(n(totalsRow?.total_credito).toFixed(2));

    // ---------- Egresos ----------
    // vendor_expenses.fecha es DATE (YYYY-MM-DD) → usamos rango YMD inclusivo
    const whereVendor = vendedor_id ? ' AND COALESCE(vendedor_id,0) = :vId' : '';

    const [expTotalRow] = await sequelize.query(
      `SELECT COALESCE(SUM(monto),0) AS total
       FROM vendor_expenses
       WHERE fecha BETWEEN :s AND :e ${whereVendor}`,
      { type: QueryTypes.SELECT, replacements: { s: startYMD, e: endYMD, vId: vendedor_id || null } }
    );
    const expenses_total = Number(n(expTotalRow?.total).toFixed(2));

    const expensesByDay = await sequelize.query(
      `SELECT fecha, COALESCE(SUM(monto),0) AS total
       FROM vendor_expenses
       WHERE fecha BETWEEN :s AND :e ${whereVendor}
       GROUP BY fecha
       ORDER BY fecha ASC`,
      { type: QueryTypes.SELECT, replacements: { s: startYMD, e: endYMD, vId: vendedor_id || null } }
    );

    const expensesByVendor = await sequelize.query(
      `SELECT COALESCE(vendedor_id,0) AS vendedor_id, COALESCE(SUM(monto),0) AS total
       FROM vendor_expenses
       WHERE fecha BETWEEN :s AND :e ${whereVendor}
       GROUP BY COALESCE(vendedor_id,0)
       ORDER BY total DESC`,
      { type: QueryTypes.SELECT, replacements: { s: startYMD, e: endYMD, vId: vendedor_id || null } }
    );

    // ---------- COGS (global) ----------
    const cogsRow = await sequelize.query(
      `SELECT COALESCE(SUM(ps.qty * CAST(COALESCE(NULLIF(p.o_price,''), '0') AS DECIMAL(12,2))), 0) AS cogs
       FROM productsales ps
       INNER JOIN invoices i ON i.invoice_number = ps.invoice_number
       LEFT JOIN products p ON p.id = ps.product_id
       WHERE i.date_time BETWEEN :startDate AND :endDate
       ${vendedor_id ? 'AND i.vendedor_id = :vId' : ''}`,
      {
        type: QueryTypes.SELECT,
        replacements: { startDate, endDate, vId: vendedor_id || null }
      }
    );
    const cogs_total = Number(n(cogsRow?.[0]?.cogs ?? cogsRow?.cogs).toFixed(2));

    // ---------- COGS por vendedor ----------
    const cogsByVendor = await sequelize.query(
      `
      SELECT
        COALESCE(i.vendedor_id, 0) AS vendedor_id,
        COALESCE(
          SUM(
            ps.qty *
            CAST(
              NULLIF(
                REPLACE(REPLACE(REPLACE(COALESCE(p.o_price,'0'), ',', ''), 'RD$', ''), '$', ''),
                ''
              ) AS DECIMAL(12,2)
            )
          ), 0
        ) AS cogs
      FROM productsales ps
      INNER JOIN invoices i ON i.invoice_number = ps.invoice_number
      LEFT JOIN products  p ON p.id = ps.product_id
      WHERE DATE(i.date_time) BETWEEN :s AND :e
      ${vendedor_id ? 'AND i.vendedor_id = :vId' : ''}
      GROUP BY COALESCE(i.vendedor_id, 0)
      ORDER BY vendedor_id ASC
      `,
      {
        type: QueryTypes.SELECT,
        replacements: { s: startYMD, e: endYMD, vId: vendedor_id || null }
      }
    );

    // ---------- Armar mapa de egresos y COGS por vendedor ----------
    const expMap  = new Map((expensesByVendor || []).map(r => [String(r.vendedor_id ?? 0), Number(r.total) || 0]));
    const cogsMap = new Map((cogsByVendor    || []).map(r => [String(r.vendedor_id ?? 0), Number(r.cogs)  || 0]));

    // ---------- byVendor final con expenses / cogs / profit / net_after_expenses ----------
    const byVendor = (byVendorRows || []).map(r => {
      const idKey = String(r.vendedor_id ?? 0);
      const total_general = Number(r.total_general) || 0;
      const expenses = expMap.get(idKey) || 0;
      const cogs     = cogsMap.get(idKey) || 0;

      return {
        vendedor_id: r.vendedor_id ?? null,
        cantidad: Number(r.cantidad) || 0,
        total_general: Number(total_general.toFixed(2)),
        total_contado: Number(n(r.total_contado).toFixed(2)),
        total_credito: Number(n(r.total_credito).toFixed(2)),
        expenses: Number(expenses.toFixed(2)),
        net_after_expenses: Number((total_general - expenses).toFixed(2)),
        cogs: Number(cogs.toFixed(2)),
        profit: Number((total_general - cogs).toFixed(2)),
      };
    });

    // ---------- Totales netos y ganancias (global) ----------
    const net_after_expenses = Number((grandTotal - expenses_total).toFixed(2));
    const profit             = Number((grandTotal - cogs_total).toFixed(2));

    res.json({
      success: true,
      range: { start: startYMD, end: endYMD },
      byVendor,
      totals: {
        countSales,
        grandTotal,
        total_contado: totalContado,
        total_credito: totalCredito,
        expenses_total,
        net_after_expenses,
        cogs_total,
        profit
      },
      expenses: {
        // importante: devolver "date" (no "fecha") para que el front lo lea
        byDay: expensesByDay.map(r => ({ date: r.fecha, total: Number(n(r.total).toFixed(2)) })),
        byVendor: expensesByVendor.map(r => ({ vendedor_id: r.vendedor_id, total: Number(n(r.total).toFixed(2)) }))
      }
    });
  } catch (error) {
    console.error('GET /api/reports/sales error:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

module.exports = router;



