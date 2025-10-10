const express = require('express');
const router = express.Router();
const { Op, fn, col, literal, QueryTypes } = require('sequelize');
const { sequelize } = require('../db');
const { Invoice, Productsale } = require('../models/Report');

/* ============================
 * Helpers de fecha RD
 * ============================ */

// Devuelve la fecha YYYY-MM-DD en zona RD
function ymdRD(date = new Date()) {
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Santo_Domingo' }));
  const y = tzDate.getFullYear();
  const m = String(tzDate.getMonth() + 1).padStart(2, '0');
  const d = String(tzDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Devuelve límites del día (inicio y fin) en RD como objetos Date con offset -04:00
function rdDayBounds(date = new Date()) {
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/Santo_Domingo' }));
  const y = tzDate.getFullYear();
  const m = String(tzDate.getMonth() + 1).padStart(2, '0');
  const d = String(tzDate.getDate()).padStart(2, '0');

  // Construimos Date con offset RD (-04:00). Si tu DB guarda DATETIME sin TZ, esto acota correctamente por RD.
  const start = new Date(`${y}-${m}-${d}T00:00:00-04:00`);
  const end   = new Date(`${y}-${m}-${d}T23:59:59.999-04:00`);
  return { start, end };
}

/* ============================================
 * RUTA NUEVA 1: Ventas del día (RD)
 * GET /api/reports/today
 *   -> Lista de facturas de hoy + productos
 *   Query opcional: ?withProducts=0/1 (1 por defecto)
 * ============================================ */
router.get('/today', async (req, res) => {
  try {
    const { start, end } = rdDayBounds(new Date());
    const withProducts = req.query.withProducts !== '0';

    const invoices = await Invoice.findAll({
      where: {
        date_time: { [Op.between]: [start, end] }
      },
      order: [['date_time', 'DESC']],
      include: withProducts ? [
        {
          model: Productsale,
          required: false
        }
      ] : [],
    });

    res.json({
      success: true,
      date: ymdRD(),
      count: invoices.length,
      data: invoices
    });
  } catch (error) {
    console.error('GET /api/reports/today error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

/* =========================================================
 * RUTA NUEVA 2: Resumen del día (RD)
 * GET /api/reports/summary-today
 *   -> Totales general/contado/crédito del día
 *   -> Totales por vendedor
 *   -> Totales por producto (qty y amount)
 * ========================================================= */
// RUTA NUEVA 2: Resumen del día (RD) — ventas a crédito = totales negativos
router.get('/summary-today', async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const { start, end } = rdDayBounds(new Date());
  
      // 1) Traer facturas del día (zona RD)
      const invoices = await Invoice.findAll({
        where: { date_time: { [Op.between]: [start, end] } },
        raw: true,
        transaction: t
      });
  
      // 2) Totales con nueva regla:
      //    - contado: total >= 0   (se suma tal cual)
      //    - crédito: total < 0    (se suma como valor POSITIVO con Math.abs)
      let total_general = 0;
      let total_contado = 0;
      let total_credito = 0;
  
      const bySeller = new Map(); // vendedor_id => { ... }
  
      invoices.forEach(inv => {
        const total = Number(inv.total) || 0;
        const vid = inv.vendedor_id || 0;
  
        total_general += total;
  
        if (!bySeller.has(vid)) {
          bySeller.set(vid, {
            vendedor_id: vid,
            cantidad: 0,
            total_general: 0,
            total_contado: 0,
            total_credito: 0
          });
        }
        const agg = bySeller.get(vid);
  
        // sumas por vendedor
        agg.cantidad += 1;
        agg.total_general += total;
  
        if (total >= 0) {
          total_contado += total;
          agg.total_contado += total;
        } else {
          const creditoAbs = Math.abs(total);
          total_credito += creditoAbs;
          agg.total_credito += creditoAbs;
        }
      });
  
      // 3) Totales por producto (todas las facturas del día)
      const productRows = await Productsale.findAll({
        include: [
          {
            model: Invoice,
            required: true,
            where: { date_time: { [Op.between]: [start, end] } },
            attributes: []
          }
        ],
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
        regla_credito: "Facturas con total < 0 se consideran crédito. Se reportan en positivo.",
        resumen: {
          total_general: Number(total_general.toFixed(2)),   // puede incluir negativos
          total_contado: Number(total_contado.toFixed(2)),   // solo >= 0
          total_credito: Number(total_credito.toFixed(2))    // suma de |total| cuando total<0
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
      await t.rollback();
      console.error('GET /api/reports/summary-today error:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        details: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  });
  

/* =========================================================
 * RUTAS EXISTENTES
 * ========================================================= */

// ROUTE-1: Get products by invoice number
// GET "/api/reports/fetchproductswithinvoicenumber/:invoice_number"
router.get('/fetchproductswithinvoicenumber/:invoice_number', async (req, res) => {
  try {
    const { invoice_number } = req.params;

    const products = await Productsale.findAll({
      where: { invoice_number }
    });

    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      details: process.env.NODE_ENV !== 'production' ? error.message : null
    });
  }
});

// ROUTE-2: Get sales report within date range
// GET "/api/reports/salesreport?from=2024-08-01&to=2024-08-11"
router.get('/salesreport', async (req, res) => {
  try {
    const { from, to } = req.query;

    let whereCondition = {};

    if (from && to) {
      const startDate = new Date(from);
      const endDate = new Date(to);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      whereCondition = {
        date_time: {
          [Op.between]: [
            startDate,
            new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1)
          ]
        }
      };
    } else if (from || to) {
      return res.status(400).json({
        error: "Both 'from' and 'to' parameters are required, or omit both to get all reports"
      });
    }

    const reports = await Invoice.findAll({
      attributes: [
        'invoice_number',
        'date_time',
        'customer_name',
        'customer_id',
        'vendedor_id',
        'total',
        'cash',
        'change'
      ],
      where: whereCondition,
      order: [['date_time', 'DESC']],
      raw: true
    });

    res.json(reports);
  } catch (error) {
    console.error('Error fetching sales report:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      details: process.env.NODE_ENV !== 'production' ? error.message : null
    });
  }
});

// ROUTE-3: Add new report - POST "/api/reports/addreport"
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
      return res.status(400).json({ error: "Products should be a non-empty array" });
    }

    // Create invoice
    const invoice = await Invoice.create({
      invoice_number,
      customer_name,
      customer_id,
      vendedor_id,
      date_time,
      total,
      cash,
      change
    }, { transaction });

    // Prepare product data
    const productData = products.map(product => ({
      invoice_number,
      product_name: product.product_name,
      product_id: product.product_id,
      amount: product.t_price,
      qty: product.qty,
      price: product.s_price
    }));

    // Bulk create products
    const productsale = await Productsale.bulkCreate(productData, { transaction });

    await transaction.commit();

    res.json({ success: true, invoice, productsale });
  } catch (error) {
    await transaction.rollback();

    console.error('Error adding report:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      details: process.env.NODE_ENV !== 'production' ? error.message : null
    });
  }
});

// =============================
// RUTA: /api/reports/sales
// Query:
//   ?start=YYYY-MM-DD
//   ?end=YYYY-MM-DD
//   ?vendedor_id=123   (opcional)
// Si no mandas start/end, usa el día de hoy en horario RD.
// =============================
router.get('/sales', async (req, res) => {
  try {
    const { start, end, vendedor_id } = req.query;

    // --- helpers de rango en RD (incluyente) ---
    function rdRangeFromParams(startStr, endStr) {
      const now = new Date();
      const tzNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Santo_Domingo' }));
      const y = tzNow.getFullYear();
      const m = String(tzNow.getMonth() + 1).padStart(2, '0');
      const d = String(tzNow.getDate()).padStart(2, '0');
      const todayYMD = `${y}-${m}-${d}`;

      const s = (startStr || todayYMD);
      const e = (endStr   || s);

      // Límites RD (UTC-04:00) inclusivos
      const startDate = new Date(`${s}T00:00:00-04:00`);
      const endDate   = new Date(`${e}T23:59:59.999-04:00`);
      return { startDate, endDate, startYMD: s, endYMD: e };
    }

    const { startDate, endDate, startYMD, endYMD } = rdRangeFromParams(start, end);

    // Filtro base para facturas
    const whereBase = {
      date_time: { [Op.between]: [startDate, endDate] }
    };
    if (vendedor_id) whereBase.vendedor_id = Number(vendedor_id);

    // ---------- VENTAS ----------
    // Totales por vendedor
    const byVendorRows = await Invoice.findAll({
      attributes: [
        'vendedor_id',
        [fn('COUNT', literal('*')), 'cantidad'],
        [fn('SUM', col('total')), 'total_general'],
        [fn('SUM', literal(`CASE WHEN payment_method = 'credit' THEN 0 ELSE total END`)), 'total_contado'],
        [fn('SUM', literal(`CASE WHEN payment_method = 'credit' THEN total ELSE 0 END`)), 'total_credito'],
      ],
      where: whereBase,
      group: ['vendedor_id'],
      raw: true
    });

    // Totales globales
    const totalsRow = await Invoice.findOne({
      attributes: [
        [fn('COUNT', literal('*')), 'countSales'],
        [fn('SUM', col('total')), 'grandTotal'],
        [fn('SUM', literal(`CASE WHEN payment_method = 'credit' THEN 0 ELSE total END`)), 'total_contado'],
        [fn('SUM', literal(`CASE WHEN payment_method = 'credit' THEN total ELSE 0 END`)), 'total_credito'],
      ],
      where: whereBase,
      raw: true
    });

    // ---------- EGRESOS ----------
    const replacementsBaseDates = {
      s: startYMD,       // vendor_expenses.fecha es DATE
      e: endYMD,
      vid: vendedor_id ? Number(vendedor_id) : null
    };

    // Total de egresos del rango
    const expensesTotalRows = await sequelize.query(
      `
      SELECT COALESCE(SUM(monto),0) AS total_expenses
      FROM vendor_expenses
      WHERE fecha BETWEEN :s AND :e
      ${vendedor_id ? ' AND vendedor_id = :vid' : ''}
      `,
      { replacements: replacementsBaseDates, type: QueryTypes.SELECT }
    );
    const expenses_total = Number((expensesTotalRows[0]?.total_expenses || 0));

    // Egresos por vendedor
    const expensesByVendor = await sequelize.query(
      `
      SELECT vendedor_id, COALESCE(SUM(monto),0) AS total_expenses
      FROM vendor_expenses
      WHERE fecha BETWEEN :s AND :e
      ${vendedor_id ? ' AND vendedor_id = :vid' : ''}
      GROUP BY vendedor_id
      `,
      { replacements: replacementsBaseDates, type: QueryTypes.SELECT }
    );

    // Egresos por día
    const expensesByDay = await sequelize.query(
      `
      SELECT fecha AS date, COALESCE(SUM(monto),0) AS total
      FROM vendor_expenses
      WHERE fecha BETWEEN :s AND :e
      ${vendedor_id ? ' AND vendedor_id = :vid' : ''}
      GROUP BY fecha
      ORDER BY fecha ASC
      `,
      { replacements: replacementsBaseDates, type: QueryTypes.SELECT }
    );

    // ---------- COGS (costo de compra de lo vendido) ----------
    // OJO: ajusta nombres de tablas si difieren:
    // - productsales  -> tabla de items vendidos (Productsale)
    // - products      -> tabla de productos (con o_price)
    const replacementsCogs = {
      start: startDate,
      end: endDate,
      vid: vendedor_id ? Number(vendedor_id) : null
    };

    // COGS total
    const cogsTotalRows = await sequelize.query(
      `
      SELECT COALESCE(SUM(ps.qty * COALESCE(p.o_price,0)),0) AS cogs_total
      FROM productsales ps
      JOIN invoices i   ON i.invoice_number = ps.invoice_number
      LEFT JOIN products p ON p.id = ps.product_id
      WHERE i.date_time BETWEEN :start AND :end
      ${vendedor_id ? ' AND i.vendedor_id = :vid' : ''}
      `,
      { replacements: replacementsCogs, type: QueryTypes.SELECT }
    );
    const cogs_total = Number((cogsTotalRows[0]?.cogs_total || 0));

    // COGS por vendedor
    const cogsByVendorRows = await sequelize.query(
      `
      SELECT i.vendedor_id, COALESCE(SUM(ps.qty * COALESCE(p.o_price,0)),0) AS cogs
      FROM productsales ps
      JOIN invoices i   ON i.invoice_number = ps.invoice_number
      LEFT JOIN products p ON p.id = ps.product_id
      WHERE i.date_time BETWEEN :start AND :end
      ${vendedor_id ? ' AND i.vendedor_id = :vid' : ''}
      GROUP BY i.vendedor_id
      `,
      { replacements: replacementsCogs, type: QueryTypes.SELECT }
    );

    // ---------- Ensamblado de respuesta ----------
    const safeNumber = (v) => Number(v || 0);

    // Índices auxiliares para egresos/COGS por vendedor
    const expByVendorMap = new Map();
    expensesByVendor.forEach(r => expByVendorMap.set(String(r.vendedor_id ?? 'null'), Number(r.total_expenses || 0)));

    const cogsByVendorMap = new Map();
    cogsByVendorRows.forEach(r => cogsByVendorMap.set(String(r.vendedor_id ?? 'null'), Number(r.cogs || 0)));

    // byVendor enriquecido
    const byVendor = byVendorRows.map(r => {
      const key = String(r.vendedor_id ?? 'null');
      const vExpenses = expByVendorMap.get(key) || 0;
      const vCogs     = cogsByVendorMap.get(key) || 0;
      const totalGen  = safeNumber(r.total_general);
      return {
        vendedor_id: r.vendedor_id ?? null,
        cantidad: safeNumber(r.cantidad),
        total_general: Number(totalGen.toFixed(2)),
        total_contado: Number(safeNumber(r.total_contado).toFixed(2)),
        total_credito: Number(safeNumber(r.total_credito).toFixed(2)),
        expenses: Number(vExpenses.toFixed(2)),
        net_after_expenses: Number((totalGen - vExpenses).toFixed(2)),
        cogs: Number(vCogs.toFixed(2)),
        profit: Number((totalGen - vCogs).toFixed(2)), // ganancia = ventas - costo compra
      };
    });

    const totals = {
      countSales: safeNumber(totalsRow?.countSales),
      grandTotal: Number(safeNumber(totalsRow?.grandTotal).toFixed(2)),
      total_contado: Number(safeNumber(totalsRow?.total_contado).toFixed(2)),
      total_credito: Number(safeNumber(totalsRow?.total_credito).toFixed(2)),
      expenses_total: Number(expenses_total.toFixed(2)),
      net_after_expenses: Number((safeNumber(totalsRow?.grandTotal) - expenses_total).toFixed(2)),
      cogs_total: Number(cogs_total.toFixed(2)),
      profit: Number((safeNumber(totalsRow?.grandTotal) - cogs_total).toFixed(2)),
    };

    res.json({
      success: true,
      range: { start: startYMD, end: endYMD },
      byVendor,
      totals,
      expenses: {
        byDay: expensesByDay.map(r => ({
          date: r.date,                       // YYYY-MM-DD
          total: Number(Number(r.total || 0).toFixed(2)),
        })),
        byVendor: expensesByVendor.map(r => ({
          vendedor_id: r.vendedor_id ?? null,
          total: Number(Number(r.total_expenses || 0).toFixed(2)),
        })),
      },
    });
  } catch (error) {
    console.error('GET /api/reports/sales error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});



module.exports = router;
