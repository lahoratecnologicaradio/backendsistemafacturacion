// routes/visitas.js
'use strict';

const express = require('express');
const router = express.Router();
const { Op, literal } = require('sequelize');

const VisitaProgramada = require('../models/VisitaProgramada');
const ResultadoVisita  = require('../models/ResultadoVisita');
const Vendedor         = require('../models/Vendedor');
const Customer         = require('../models/Customer');

// ⚠️ Modelos opcionales
let Invoice = null;
let Payment = null;
// Modelo para capacitación
let TrainingVideo = null;

try {
  // Debe exponer: vendedor_id/seller_id, customer_id, invoice_number, date_time, total, payment_method
  Invoice = require('../models/Invoice');
} catch (_) {
  console.warn('[visitas] Modelo Invoice no disponible');
}
try {
  Payment = require('../models/Payment');
} catch (_) {
  console.warn('[visitas] Modelo Payment no disponible');
}
try {
  // Tabla: training_videos (id, titulo, url, orden, is_active, created_at, updated_at)
  TrainingVideo = require('../models/TrainingVideo');
} catch (_) {
  console.warn('[visitas] Modelo TrainingVideo no disponible');
}

/* ===================== *
 *  Helpers de Fechas    *
 * ===================== */

// YYYY-MM-DD (fecha local del servidor, no UTC)
function todayYMDLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Acepta 'YYYY-MM-DD', 'DD-MM-YYYY', 'DD/MM/YYYY' -> 'YYYY-MM-DD'
function normalizeToYMD(input) {
  if (!input) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const m = input.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }
  // Último intento: Date() nativo
  const d = new Date(input);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    return `${y}-${M}-${D}`;
  }
  return null;
}

// Valida una URL básica de YouTube (youtube.com/watch?v=... | youtu.be/...)
function isValidYouTubeUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const isYT = host === 'youtube.com' || host === 'youtu.be';
    if (!isYT) return false;

    if (host === 'youtu.be') {
      return u.pathname && u.pathname.length > 1; // /VIDEOID
    }
    if (host === 'youtube.com') {
      return Boolean(u.searchParams.get('v')) || u.pathname.startsWith('/embed/');
    }
    return false;
  } catch {
    return false;
  }
}

// Include común (cliente, vendedor, resultado)
const COMMON_INCLUDE = [
  { model: Customer,  as: 'cliente',  attributes: ['id','full_name','address','c_number'] },
  { model: Vendedor,  as: 'vendedor', attributes: ['id','nombre'] },
  { model: ResultadoVisita, as: 'resultado', required: false },
];

/* ========================================================= *
 * NUEVAS RUTAS: Capacitación                                *
 * URLs:
 *   GET  /api/visitas/capacitacion
 *   POST /api/visitas/capacitacion
 * ========================================================= */

// GET: lista de videos activos (array plano)
router.get('/capacitacion', async (_req, res) => {
  try {
    if (TrainingVideo) {
      const rows = await TrainingVideo.findAll({
        where: { is_active: 1 },
        attributes: ['id', 'titulo', 'url', 'orden', 'is_active'],
        order: [['orden', 'ASC'], ['id', 'ASC']],
      });

      // El front puede ignorar campos extra; devolvemos id/titulo/url (+orden opcional)
      const list = rows.map(r => ({
        id: r.id,
        titulo: r.titulo,
        url: r.url,
        orden: r.orden ?? 0,
        is_active: r.is_active ? 1 : 0,
      }));

      return res.json(list); // arreglo directo
    }

    // Fallback sin modelo (ejemplos)
    const fallback = [
      { id: 1, titulo: 'Cómo hacer un pedido', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', orden: 1, is_active: 1 },
      { id: 2, titulo: 'Cómo cobrar una factura', url: 'https://youtu.be/9bZkp7q19f0', orden: 2, is_active: 1 },
    ];
    return res.json(fallback);
  } catch (e) {
    console.error('GET /visitas/capacitacion ERROR =>', e);
    return res.status(200).json([]); // el front tolera arreglo vacío
  }
});

// POST: crear video de capacitación
router.post('/capacitacion', async (req, res) => {
  try {
    if (!TrainingVideo) {
      return res.status(501).json({ success: false, message: 'Modelo TrainingVideo no disponible en el servidor.' });
    }

    const { titulo, url, orden, is_active } = req.body || {};
    if (!titulo || !url) {
      return res.status(400).json({ success: false, message: 'Campos requeridos: titulo, url.' });
    }
    if (!isValidYouTubeUrl(String(url))) {
      return res.status(400).json({ success: false, message: 'URL de YouTube inválida.' });
    }

    const payload = {
      titulo: String(titulo).trim(),
      url: String(url).trim(),
    };

    if (orden !== undefined && !Number.isNaN(Number(orden))) payload.orden = Number(orden);
    if (is_active !== undefined) payload.is_active = Number(is_active) ? 1 : 0;

    const created = await TrainingVideo.create(payload);

    return res.status(201).json({
      success: true,
      data: {
        id: created.id,
        titulo: created.titulo,
        url: created.url,
        orden: created.orden ?? 0,
        is_active: created.is_active ? 1 : 0,
      },
    });
  } catch (e) {
    console.error('POST /visitas/capacitacion ERROR =>', e);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

/* ============================= *
 * 1) Planificar una visita      *
 * ============================= */
router.post('/planificar', async (req, res) => {
  try {
    const { vendedor_id, customer_id, fecha_programada, hora_programada, prioridad, observaciones } = req.body;

    if (!vendedor_id || !customer_id || !fecha_programada) {
      return res.status(400).json({ success: false, message: 'Vendedor, cliente y fecha son requeridos' });
    }

    const vendedor = await Vendedor.findByPk(vendedor_id);
    if (!vendedor) return res.status(404).json({ success: false, message: 'Vendedor no encontrado' });

    const cliente = await Customer.findByPk(customer_id);
    if (!cliente) return res.status(404).json({ success: false, message: 'Cliente no encontrado' });

    const exists = await VisitaProgramada.findOne({
      where: { vendedor_id, customer_id, fecha_programada }
    });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Ya existe una visita para ese cliente en esa fecha' });
    }

    const visita = await VisitaProgramada.create({
      vendedor_id,
      customer_id,
      fecha_programada,            // DATEONLY => 'YYYY-MM-DD'
      hora_programada,
      prioridad: prioridad || 'media',
      observaciones,
      estado: 'pendiente'
    });

    res.status(201).json({ success: true, message: 'Visita programada exitosamente', data: visita });
  } catch (e) {
    console.error('POST /visitas/planificar', e);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

/* ========================================================= *
 * 2) Pendientes por vendedor en fecha exacta                *
 * ========================================================= */
router.get('/pendientes/:vendedorId/:fecha', async (req, res) => {
  try {
    const { vendedorId, fecha } = req.params;
    const ymd = normalizeToYMD(fecha);
    if (!ymd) return res.status(400).json({ success: false, message: 'Fecha inválida' });

    const vendedor = await Vendedor.findByPk(vendedorId);
    if (!vendedor) return res.status(404).json({ success: false, message: 'Vendedor no encontrado' });

    const data = await VisitaProgramada.findAll({
      where: { vendedor_id: vendedorId, fecha_programada: ymd, estado: 'pendiente' },
      include: COMMON_INCLUDE,
      order: [['prioridad','DESC'], ['hora_programada','ASC']]
    });

    res.json({ success: true, fecha: ymd, vendedor: vendedor.nombre, total_pendientes: data.length, data });
  } catch (e) {
    console.error('GET /visitas/pendientes/:vendedorId/:fecha', e);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

/* ========================================================= *
 * 3) Realizadas por vendedor en fecha exacta                *
 * ========================================================= */
router.get('/realizadas/:vendedorId/:fecha', async (req, res) => {
  try {
    const { vendedorId, fecha } = req.params;
    const ymd = normalizeToYMD(fecha);
    if (!ymd) return res.status(400).json({ success: false, message: 'Fecha inválida' });

    const vendedor = await Vendedor.findByPk(vendedorId);
    if (!vendedor) return res.status(404).json({ success: false, message: 'Vendedor no encontrado' });

    const data = await VisitaProgramada.findAll({
      where: { vendedor_id: vendedorId, fecha_programada: ymd, estado: 'realizada' },
      include: COMMON_INCLUDE,
      order: [['fecha_realizacion','DESC']]
    });

    res.json({ success: true, fecha: ymd, vendedor: vendedor.nombre, total_realizadas: data.length, data });
  } catch (e) {
    console.error('GET /visitas/realizadas/:vendedorId/:fecha', e);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

/* ========================================================= *
 * 4) Resumen de día por vendedor                            *
 * ========================================================= */
router.get('/resumen-dia/:vendedorId/:fecha', async (req, res) => {
  try {
    const { vendedorId, fecha } = req.params;
    const ymd = normalizeToYMD(fecha);
    if (!ymd) return res.status(400).json({ success: false, message: 'Fecha inválida' });

    const vendedor = await Vendedor.findByPk(vendedorId);
    if (!vendedor) return res.status(404).json({ success: false, message: 'Vendedor no encontrado' });

    const visitasDelDia = await VisitaProgramada.findAll({
      where: { vendedor_id: vendedorId, fecha_programada: ymd },
      include: [
        { model: Customer, as: 'cliente', attributes: ['id','full_name','address','c_number','product_name','total','due_date'] },
        { model: ResultadoVisita, as: 'resultado', required: false,
          attributes: ['id','visita_id','interes_cliente','probabilidad_venta','productos_interes','pedido_realizado','monto_potencial','observaciones','proxima_visita','created_at'] },
        { model: Vendedor, as: 'vendedor', attributes: ['id','nombre'] }
      ],
      order: [['estado','ASC'], ['prioridad','DESC'], ['hora_programada','ASC']]
    });

    const realizadas = visitasDelDia.filter(v => v.estado === 'realizada');
    const pendientes = visitasDelDia.filter(v => v.estado === 'pendiente');
    const total = visitasDelDia.length;
    const porcentaje_realizadas = total ? Math.round((realizadas.length / total) * 100) : 0;
    const monto_potencial_total = realizadas.reduce((acc, v) => {
      const m = v.resultado?.monto_potencial ? parseFloat(v.resultado.monto_potencial) : 0;
      return acc + (isNaN(m) ? 0 : m);
    }, 0);

    res.json({
      success: true,
      fecha: ymd,
      vendedor: { id: vendedor.id, nombre: vendedor.nombre },
      resumen: {
        total_visitas: total,
        realizadas: realizadas.length,
        pendientes: pendientes.length,
        porcentaje_realizadas,
        monto_potencial_total: monto_potencial_total.toFixed(2)
      },
      visitas_realizadas: realizadas,
      visitas_pendientes: pendientes
    });
  } catch (e) {
    console.error('GET /visitas/resumen-dia/:vendedorId/:fecha', e);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

/* ========================================================= *
 * 5) Registrar resultado (por visita_id o por datos)        *
 * ========================================================= */
router.post('/registrar-resultado', async (req, res) => {
  try {
    const {
      visita_id,
      vendedor_id,
      customer_id,
      interes_cliente,
      probabilidad_venta,
      productos_interes,
      pedido_realizado,
      monto_potencial,
      observaciones,
      proxima_visita,
      hora_realizacion,
      duracion_visita
    } = req.body;

    let visita = null;

    if (visita_id) {
      visita = await VisitaProgramada.findByPk(visita_id);
      if (!visita) return res.status(404).json({ success: false, message: 'Visita no encontrada' });
    } else if (vendedor_id && customer_id) {
      const today = todayYMDLocal();
      visita = await VisitaProgramada.findOne({
        where: { vendedor_id, customer_id, fecha_programada: today }
      });
      if (!visita) {
        visita = await VisitaProgramada.create({
          vendedor_id, customer_id, fecha_programada: today, estado: 'pendiente', prioridad: 'media'
        });
      }
    } else {
      return res.status(400).json({ success: false, message: 'Se requiere visita_id o (vendedor_id y customer_id)' });
    }

    // Actualizar visita como realizada (y anexar campos opcionales)
    await visita.update({
      estado: 'realizada',
      fecha_realizacion: new Date(),
      ...(hora_realizacion ? { hora_realizacion } : {}),
      ...(duracion_visita ? { duracion_visita } : {}),
      ...(observaciones ? {
        observaciones: visita.observaciones ? `${visita.observaciones} | ${observaciones}` : observaciones
      } : {})
    });

    // Registrar resultado
    const resultado = await ResultadoVisita.create({
      visita_id: visita.id,
      interes_cliente: interesCliente || interes_cliente || 'medio',
      probabilidad_venta: probabilidad_venta || 'media',
      productos_interes: productos_interes || '',
      pedido_realizado: !!pedido_realizado,
      monto_potencial: monto_potencial ? parseFloat(monto_potencial) : 0,
      observaciones: observaciones || '',
      proxima_visita: proxima_visita || null
    });

    res.json({ success: true, message: 'Resultado registrado', data: { visita, resultado } });
  } catch (e) {
    console.error('POST /visitas/registrar-resultado', e);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

/* ========================================================= *
 * 6) Historial por vendedor (opcional ?fecha=YYYY-MM-DD)    *
 * ========================================================= */
router.get('/historial/:vendedorId', async (req, res) => {
  try {
    const { vendedorId } = req.params;
    const ymd = normalizeToYMD(req.query.fecha);

    const where = { vendedor_id: vendedorId };
    if (ymd) where.fecha_programada = ymd;

    const visitas = await VisitaProgramada.findAll({
      where,
      include: [
        { model: Customer, as: 'cliente', attributes: ['id','full_name','address'] },
        { model: ResultadoVisita, as: 'resultado', required: false }
      ],
      order: [['fecha_programada','DESC'], ['hora_programada','ASC']],
      limit: 50
    });

    res.json({ success: true, count: visitas.length, data: visitas });
  } catch (e) {
    console.error('GET /visitas/historial/:vendedorId', e);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

/* ========================================================= *
 * 7) Cobros por día (ventas reales + abonos de crédito)
 *    - Contado del día (Invoice con total>0)
 *    - Abonos de crédito del día (Payment)  ← exacto
 *    - Fallback SIN payments:
 *        • Facturas saldadas ese día (paid_at)
 *        • Abonos parciales detectados por updated_at (usa paid_amount del día)
 * ========================================================= */
router.get('/cobros/:vendedorId/:fecha', async (req, res) => {
  try {
    const { vendedorId, fecha } = req.params;
    const ymd = normalizeToYMD(fecha);
    if (!ymd) {
      return res.status(400).json({ success: false, message: 'Fecha inválida (use YYYY-MM-DD)' });
    }

    // Validar vendedor
    const vendedor = await Vendedor.findByPk(vendedorId, { attributes: ['id','nombre'] });
    if (!vendedor) {
      return res.status(404).json({ success: false, message: 'Vendedor no encontrado' });
    }

    if (!Invoice) {
      return res.json({
        success: true,
        fecha: ymd,
        vendedor: { id: vendedor.id, nombre: vendedor.nombre },
        resumen_cobros: {
          total_contado: '0.00',
          total_credito: '0.00',
          total_general: '0.00',
          cantidad_ventas: 0,
          promedio_venta: '0.00'
        },
        detalles_cobros: [],
        warning: 'Modelo Invoice no disponible'
      });
    }

    // -------- Detectar columna de vendedor en invoices --------
    const sellerColInInv = Invoice.rawAttributes?.vendedor_id
      ? 'vendedor_id'
      : (Invoice.rawAttributes?.seller_id ? 'seller_id' : null);

    if (!sellerColInInv) {
      return res.status(500).json({ success: false, message: 'La tabla invoices no tiene vendedor_id/seller_id' });
    }

    // ========== 1) Ventas al contado del día ==========
    const cashSales = await Invoice.findAll({
      where: literal(`
        ${sellerColInInv}=${Number(vendedorId)}
        AND payment_method IN ('cash','contado')
        AND total > 0
        AND DATE(date_time)='${ymd}'
      `),
      order: [['date_time','ASC']]
    });

    // ========== 2) Abonos de crédito (tabla payments si existe) ==========
    let payments = [];
    let payTimeField = 'created_at';
    let payInvoiceKey = null;     // 'invoice_number' o 'invoice_id'
    let sellerColInPay = null;    // 'vendedor_id' o 'seller_id'
    if (Payment) {
      sellerColInPay = Payment.rawAttributes?.vendedor_id
        ? 'vendedor_id'
        : (Payment.rawAttributes?.seller_id ? 'seller_id' : null);
      if (!sellerColInPay) sellerColInPay = '1=1'; // si no existe, no filtramos por vendedor (último recurso)

      if (Payment.rawAttributes?.paid_at) payTimeField = 'paid_at';
      if (Payment.rawAttributes?.invoice_number) payInvoiceKey = 'invoice_number';
      else if (Payment.rawAttributes?.invoice_id) payInvoiceKey = 'invoice_id';

      payments = await Payment.findAll({
        where: literal(`
          ${sellerColInPay !== '1=1' ? `${sellerColInPay}=${Number(vendedorId)} AND` : ''}
          DATE(${payTimeField})='${ymd}'
        `),
        order: [[payTimeField, 'ASC']]
      });
    }

    // 2a) Cargar invoices referenciadas por payments para hidratar cliente
    let invoicesFromPayments = [];
    let payKeyValues = [];
    if (payInvoiceKey && payments.length > 0) {
      payKeyValues = payments.map(p => p[payInvoiceKey]).filter(Boolean).map(v => String(v));
      if (payKeyValues.length > 0) {
        if (Invoice.rawAttributes?.invoice_number) {
          invoicesFromPayments = await Invoice.findAll({ where: { invoice_number: payKeyValues } });
        } else if (Invoice.rawAttributes?.id) {
          invoicesFromPayments = await Invoice.findAll({ where: { id: payKeyValues } });
        }
      }
    }
    const invoiceByRefFromPay = new Map(invoicesFromPayments.map(inv => {
      const key = String(inv.invoice_number ?? inv.id);
      return [key, inv];
    }));

    // ========== 3) Fallback SIN payments ==========
    // 3a) Facturas de crédito saldadas ese día (paid_at)
    const creditSettledInvoices = await Invoice.findAll({
      where: literal(`
        ${sellerColInInv}=${Number(vendedorId)}
        AND payment_method IN ('credit','crédito')
        AND COALESCE(paid_amount,0) > 0
        AND DATE(paid_at)='${ymd}'
      `),
      order: [['paid_at','ASC']]
    });

    // 3b) Abonos parciales detectados por updated_at/updatedAt (mismo día)
    const updatedFieldName =
      (Invoice.rawAttributes?.updated_at && 'updated_at') ||
      (Invoice.rawAttributes?.updatedAt && 'updatedAt') ||
      null;

    let creditPartialsByUpdated = [];
    if (updatedFieldName) {
      creditPartialsByUpdated = await Invoice.findAll({
        where: literal(`
          ${sellerColInInv}=${Number(vendedorId)}
          AND payment_method IN ('credit','crédito')
          AND COALESCE(paid_amount,0) > 0
          AND DATE(${updatedFieldName})='${ymd}'
        `),
        order: [[updatedFieldName,'ASC']]
      });
    }

    // ===== Hidratar clientes (cash + invoices de payments + settled + parciales) =====
    const customerIds = new Set();
    for (const inv of cashSales) if (inv.customer_id) customerIds.add(inv.customer_id);
    for (const inv of invoicesFromPayments) if (inv.customer_id) customerIds.add(inv.customer_id);
    for (const inv of creditSettledInvoices) if (inv.customer_id) customerIds.add(inv.customer_id);
    for (const inv of creditPartialsByUpdated) if (inv.customer_id) customerIds.add(inv.customer_id);

    const customers = customerIds.size
      ? await Customer.findAll({
          where: { id: Array.from(customerIds) },
          attributes: ['id','full_name','c_number','address']
        })
      : [];
    const customerMap = new Map(customers.map(c => [c.id, c]));

    // ===== Evitar doble conteo =====
    // Si hay payments del día para una factura, no sumar además por "saldada" ese mismo día.
    const paidInvoiceSetFromPayments = new Set(
      payKeyValues && payKeyValues.length ? payKeyValues.map(String) : []
    );

    // ===== Armar respuesta =====
    let totalContado = 0, totalCredito = 0, totalGeneral = 0;
    const detalles = [];

    // (A) Contado
    for (const inv of cashSales) {
      const monto = Number(inv.total) || 0;
      totalContado += monto;
      totalGeneral += monto;

      const cust = inv.customer_id ? customerMap.get(inv.customer_id) : null;

      detalles.push({
        visita_id: String(inv.invoice_number ?? inv.id),
        cliente_id: cust?.id || null,
        cliente_nombre: cust?.full_name || null,
        cliente_numero: cust?.c_number || null,
        cliente_direccion: cust?.address || null,
        monto_contado: monto,
        monto_credito: 0,
        monto_total: monto,
        tipo_pago: 'contado',
        observaciones: 'FACTURA',
        hora_visita: inv.date_time,
        fecha_visita: ymd
      });
    }

    // (B) Abonos (payments reales)
    for (const p of payments) {
      const amount = Number(p.amount) || 0;
      const refKey = payInvoiceKey ? String(p[payInvoiceKey]) : null;
      const invRef = refKey ? invoiceByRefFromPay.get(refKey) : null;
      const cust = invRef?.customer_id ? customerMap.get(invRef.customer_id) : null;

      totalCredito += amount;
      totalGeneral += amount;

      detalles.push({
        visita_id: p.id ? String(p.id) : (refKey || `${Math.random()}`),
        cliente_id: cust?.id || null,
        cliente_nombre: cust?.full_name || null,
        cliente_numero: cust?.c_number || null,
        cliente_direccion: cust?.address || null,
        monto_contado: 0,
        monto_credito: amount,
        monto_total: amount,
        tipo_pago: 'credito',
        observaciones: 'ABONO A CRÉDITO',
        hora_visita: p[payTimeField] || p.created_at || p.paid_at,
        fecha_visita: ymd
      });
    }

    // (C) Facturas de crédito saldadas ese día (si NO hubo payments de esa factura ese día)
    for (const inv of creditSettledInvoices) {
      const invKey = String(inv.invoice_number ?? inv.id);
      if (paidInvoiceSetFromPayments.has(invKey)) continue; // ya contada por payments

      const amount = Number(inv.paid_amount) || 0;
      if (amount <= 0) continue;

      const cust = inv.customer_id ? customerMap.get(inv.customer_id) : null;

      totalCredito += amount;
      totalGeneral += amount;

      detalles.push({
        visita_id: invKey,
        cliente_id: cust?.id || null,
        cliente_nombre: cust?.full_name || null,
        cliente_numero: cust?.c_number || null,
        cliente_direccion: cust?.address || null,
        monto_contado: 0,
        monto_credito: amount,
        monto_total: amount,
        tipo_pago: 'credito',
        observaciones: 'FACTURA SALDADA',
        hora_visita: inv.paid_at || inv.date_time,
        fecha_visita: ymd
      });
    }

    // (D) Fallback: abonos parciales detectados por updated_at (NO hay payments para esa factura ese día, ni saldada)
    if (updatedFieldName) {
      // Set de facturas ya contadas (por payments o por saldada)
      const alreadyCounted = new Set([
        ...paidInvoiceSetFromPayments,
        ...creditSettledInvoices.map(x => String(x.invoice_number ?? x.id))
      ]);

      for (const inv of creditPartialsByUpdated) {
        const invKey = String(inv.invoice_number ?? inv.id);
        if (alreadyCounted.has(invKey)) continue;

        const absTotal = Math.abs(Number(inv.total) || 0);
        const paid = Number(inv.paid_amount || 0);
        if (!paid || paid >= absTotal) continue; // si ya está saldada o sin abonos, omite

        const cust = inv.customer_id ? customerMap.get(inv.customer_id) : null;

        // ⚠️ Sin tabla payments no sabemos el DELTA exacto del día → usamos el acumulado paid_amount del día
        const amountToday = paid;

        totalCredito += amountToday;
        totalGeneral += amountToday;

        detalles.push({
          visita_id: invKey,
          cliente_id: cust?.id || null,
          cliente_nombre: cust?.full_name || null,
          cliente_numero: cust?.c_number || null,
          cliente_direccion: cust?.address || null,
          monto_contado: 0,
          monto_credito: amountToday,
          monto_total: amountToday,
          tipo_pago: 'credito',
          observaciones: 'ABONO (fallback sin payments)',
          hora_visita: inv[updatedFieldName],
          fecha_visita: ymd
        });
      }
    }

    // Orden cronológico
    detalles.sort((a, b) => {
      const ta = new Date(a.hora_visita).getTime() || 0;
      const tb = new Date(b.hora_visita).getTime() || 0;
      return ta - tb;
    });

    // Respuesta
    return res.json({
      success: true,
      fecha: ymd,
      vendedor: { id: vendedor.id, nombre: vendedor.nombre },
      resumen_cobros: {
        total_contado: totalContado.toFixed(2),
        total_credito: totalCredito.toFixed(2),
        total_general: totalGeneral.toFixed(2),
        cantidad_ventas: detalles.length,
        promedio_venta: detalles.length ? (totalGeneral / detalles.length).toFixed(2) : '0.00'
      },
      detalles_cobros: detalles
    });
  } catch (e) {
    console.error('GET /visitas/cobros/:vendedorId/:fecha ERROR =>', e);
    res.status(500).json({ success: false, message: 'Error interno del servidor', error: String(e?.message || e) });
  }
});



/* ========================================================= *
 * 8) Listados generales (/hoy, /dia/:fecha, /list)          *
 * ========================================================= */

// HOY (diagnóstico incluido)
router.get('/hoy', async (_req, res) => {
  try {
    const today = todayYMDLocal();
    console.log('[VISITAS /hoy] hoy(local)=', today);

    // 1) Consulta normal (con estado esperado)
    const withEstado = await VisitaProgramada.findAll({
      where: { 
        fecha_programada: today, 
        estado: { [Op.in]: ['pendiente', 'realizada'] } 
      },
      include: COMMON_INCLUDE,
      order: [['hora_programada','ASC'], ['prioridad','DESC']]
    });

    // Log por estado
    const byEstado = withEstado.reduce((acc, v) => {
      acc[v.estado] = (acc[v.estado] || 0) + 1;
      return acc;
    }, {});
    console.log('[VISITAS /hoy] con estado -> encontrados:', withEstado.length, 'por estado:', byEstado);

    // 2) Si no encontró nada, probar SIN estado
    let data = withEstado;
    let fallbackUsed = false;
    if (withEstado.length === 0) {
      const sinEstado = await VisitaProgramada.findAll({
        where: { fecha_programada: today },
        include: COMMON_INCLUDE,
        order: [['hora_programada','ASC'], ['prioridad','DESC']]
      });
      const estadosDetectados = [...new Set(sinEstado.map(v => v.estado))];
      console.log('[VISITAS /hoy] sin estado -> encontrados:', sinEstado.length, 'estados:', estadosDetectados);
      data = sinEstado;
      fallbackUsed = true;
    }

    // 3) Sample cuando no hay datos
    let sample = [];
    if (data.length === 0) {
      sample = await VisitaProgramada.findAll({
        order: [['id','DESC']],
        limit: 5
      });
      console.log('[VISITAS /hoy] sample últimas 5 filas:', sample.map(r => ({
        id: r.id, fecha_programada: r.fecha_programada, estado: r.estado, vendedor_id: r.vendedor_id, customer_id: r.customer_id
      })));
    }

    return res.json({
      success: true,
      fecha: today,
      count: data.length,
      used_fallback_no_estado: fallbackUsed,
      data,
      sample_when_empty: sample
    });
  } catch (e) {
    console.error('GET /visitas/hoy', e);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// DIA: pendientes + realizadas de TODOS en fecha exacta
router.get('/dia/:fecha', async (req, res) => {
  try {
    const ymd = normalizeToYMD(req.params.fecha);
    if (!ymd) return res.status(400).json({ success: false, message: 'Formato de fecha inválido' });

    const visitas = await VisitaProgramada.findAll({
      where: { fecha_programada: ymd, estado: { [Op.in]: ['pendiente','realizada'] } },
      include: COMMON_INCLUDE,
      order: [['hora_programada','ASC'], ['prioridad','DESC']]
    });

    res.json({ success: true, fecha: ymd, count: visitas.length, data: visitas });
  } catch (e) {
    console.error('GET /visitas/dia/:fecha', e);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// LIST: rango y filtros
router.get('/list', async (req, res) => {
  try {
    const today = todayYMDLocal();

    const dateParam = normalizeToYMD(req.query.date);
    const from = dateParam || normalizeToYMD(req.query.from) || today;
    const to   = dateParam || normalizeToYMD(req.query.to)   || today;

    const estado = req.query.estado || 'all';
    const vendedor_id = req.query.vendedor_id ? Number(req.query.vendedor_id) : null;
    const customer_id = req.query.customer_id ? Number(req.query.customer_id) : null;

    const where = { fecha_programada: { [Op.between]: [from, to] } };
    if (estado !== 'all') where.estado = estado;
    else where.estado = { [Op.in]: ['pendiente','realizada'] };

    if (vendedor_id) where.vendedor_id = vendedor_id;
    if (customer_id) where.customer_id = customer_id;

    const visitas = await VisitaProgramada.findAll({
      where,
      include: COMMON_INCLUDE,
      order: [['fecha_programada','ASC'], ['hora_programada','ASC'], ['prioridad','DESC']]
    });

    // Flags para el front
    const base = new Date(`${today}T00:00:00`);
    const data = visitas.map(v => {
      const d = new Date(`${v.fecha_programada}T00:00:00`);
      const days_left = Math.round((d - base) / (1000*60*60*24));
      const is_past = (days_left < 0) && v.estado === 'pendiente';
      const is_urgent = v.estado === 'pendiente' && days_left >= 0 && days_left <= 3;
      return { ...v.toJSON(), days_left, is_past, is_urgent };
    });

    res.json({
      success: true,
      filters: { estado, from, to, vendedor_id, customer_id },
      count: data.length,
      data
    });
  } catch (e) {
    console.error('GET /visitas/list', e);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

/* ========================================================= *
 * 9) Eliminar una visita                                    *
 * ========================================================= */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const visita = await VisitaProgramada.findByPk(id);
    if (!visita) return res.status(404).json({ success: false, message: 'Visita no encontrada' });
    await visita.destroy();
    res.json({ success: true, message: 'Visita eliminada' });
  } catch (e) {
    console.error('DELETE /visitas/:id', e);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

module.exports = router;


