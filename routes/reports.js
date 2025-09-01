const express = require('express');
const router = express.Router();
const { Op, fn, col, literal } = require('sequelize');
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

module.exports = router;
