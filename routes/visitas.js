// routes/visitas.js
'use strict';

const express = require('express');
const router = express.Router();
const { Op, literal } = require('sequelize');

const VisitaProgramada = require('../models/VisitaProgramada');
const ResultadoVisita  = require('../models/ResultadoVisita');
const Vendedor         = require('../models/Vendedor');
const Customer         = require('../models/Customer');

// ⚠️ Estos dos son necesarios para que /cobros sume ventas reales.
// Si aún no tienes los modelos, deja el require en try/catch.
let Invoice = null;
let Payment = null;
try {
  // Debe exponer: vendedor_id, customer_id, invoice_number, date_time, total, payment_method, paid_amount, balance, paid_at
  Invoice = require('../models/Invoice');
} catch (_) {
  console.warn('[visitas] Modelo Invoice no disponible');
}
try {
  // Debe exponer: (invoice_id o invoice_number), (vendedor_id o seller_id), amount, (created_at o paid_at)
  Payment = require('../models/Payment');
} catch (_) {
  console.warn('[visitas] Modelo Payment no disponible');
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

// Include común (cliente, vendedor, resultado)
const COMMON_INCLUDE = [
  { model: Customer,  as: 'cliente',  attributes: ['id','full_name','address','c_number'] },
  { model: Vendedor,  as: 'vendedor', attributes: ['id','nombre'] },
  { model: ResultadoVisita, as: 'resultado', required: false },
];

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
      interes_cliente: interes_cliente || 'medio',
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
 * 7) Cobros de un vendedor en una fecha (ventas reales)     *
 *    - Contado del día (Invoice)
 *    - Abonos de crédito del día (Payment) + SIEMPRE facturas saldadas por paid_at
 *      (evitar doble conteo si ya hay payments de esa factura)
 * ========================================================= */
router.get('/cobros/:vendedorId/:fecha', async (req, res) => {
  try {
    const { vendedorId, fecha } = req.params;
    const ymd = normalizeToYMD(fecha);
    if (!ymd) return res.status(400).json({ success: false, message: 'Fecha inválida (use YYYY-MM-DD)' });

    const vendedor = await Vendedor.findByPk(vendedorId, { attributes: ['id','nombre'] });
    if (!vendedor) return res.status(404).json({ success: false, message: 'Vendedor no encontrado' });

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
        warning: 'Modelo Invoice no disponible en el servidor'
      });
    }

    // -------- 1) Ventas al contado del día --------
    const cashSales = await Invoice.findAll({
      where: literal(`
        vendedor_id=${Number(vendedorId)}
        AND payment_method IN ('cash','contado')
        AND DATE(date_time)='${ymd}'
      `),
      order: [['date_time','ASC']]
    });

    // -------- 2) Pagos a crédito del día (tabla payments si existe) --------
    let creditPayments = [];
    let paymentSellerFilter = `1=1`;
    let paymentDateFilter  = `DATE(created_at)='${ymd}'`;
    let paymentInvoiceKey  = null; // 'invoice_id' o 'invoice_number'
    let paymentTimeField   = 'created_at';

    if (Payment) {
      // Detectar columna de vendedor
      if (Payment.rawAttributes?.vendedor_id) {
        paymentSellerFilter = `vendedor_id=${Number(vendedorId)}`;
      } else if (Payment.rawAttributes?.seller_id) {
        paymentSellerFilter = `seller_id=${Number(vendedorId)}`;
      }

      // Detectar campo de fecha
      if (Payment.rawAttributes?.paid_at) {
        paymentDateFilter = `DATE(paid_at)='${ymd}'`;
        paymentTimeField = 'paid_at';
      }

      // Detectar FK hacia invoice
      if (Payment.rawAttributes?.invoice_id) {
        paymentInvoiceKey = 'invoice_id';
      } else if (Payment.rawAttributes?.invoice_number) {
        paymentInvoiceKey = 'invoice_number';
      }

      creditPayments = await Payment.findAll({
        where: literal(`${paymentSellerFilter} AND (${paymentDateFilter})`),
        order: [[paymentTimeField, 'ASC']]
      });
    }

    // 2a) Cargar facturas referenciadas por pagos
    let invoicesFromPayments = [];
    let keys = [];
    if (paymentInvoiceKey) {
      keys = creditPayments.map(p => p[paymentInvoiceKey]).filter(Boolean).map(v => String(v));
      if (keys.length) {
        // Intentar por invoice_number (PK típico)
        if (Invoice.rawAttributes?.invoice_number) {
          invoicesFromPayments = await Invoice.findAll({ where: { invoice_number: keys } });
        } else if (Invoice.rawAttributes?.id) {
          // Fallback por id
          invoicesFromPayments = await Invoice.findAll({ where: { id: keys } });
        }
      }
    }
    const invoiceByNumber = new Map(
      invoicesFromPayments.map(inv => [String(inv.invoice_number ?? inv.id), inv])
    );

    // -------- 3) Facturas de crédito saldadas ese día (siempre, para no perder ninguna) --------
    const creditSettledInvoices = await Invoice.findAll({
      where: literal(`
        vendedor_id=${Number(vendedorId)}
        AND payment_method IN ('credit','crédito')
        AND DATE(paid_at)='${ymd}'
        AND COALESCE(paid_amount,0) > 0
      `),
      order: [['paid_at','ASC']]
    });

    // --- Hidratar clientes (de contado + pagos + saldadas) ---
    const customerIds = new Set();

    // contado
    for (const inv of cashSales) if (inv.customer_id) customerIds.add(inv.customer_id);

    // pagos: customer desde la invoice referenciada si existe
    for (const p of creditPayments) {
      const key = paymentInvoiceKey ? String(p[paymentInvoiceKey]) : null;
      const inv = key ? invoiceByNumber.get(key) : null;
      if (inv?.customer_id) customerIds.add(inv.customer_id);
    }

    // saldadas
    for (const inv of creditSettledInvoices) if (inv.customer_id) customerIds.add(inv.customer_id);

    const customers = customerIds.size
      ? await Customer.findAll({
          where: { id: Array.from(customerIds) },
          attributes: ['id','full_name','c_number','address']
        })
      : [];
    const customerMap = new Map(customers.map(c => [c.id, c]));

    // --- Para evitar doble conteo: IDs de facturas que YA aportaron por pagos ---
    const paidInvoiceSet = new Set(
      (paymentInvoiceKey ? creditPayments.map(p => String(p[paymentInvoiceKey])).filter(Boolean) : [])
    );

    // --- Armar respuesta ---
    let totalContado = 0, totalCredito = 0, totalGeneral = 0;
    const detalles = [];

    // Contado
    for (const inv of cashSales) {
      const monto = Number(inv.total) || 0;
      totalContado += monto;
      totalGeneral += monto;

      const custObj = inv.customer_id ? customerMap.get(inv.customer_id) : null;

      detalles.push({
        visita_id: String(inv.invoice_number ?? inv.id),
        cliente_id: custObj?.id || null,
        cliente_nombre: custObj?.full_name || null,
        cliente_numero: custObj?.c_number || null,
        cliente_direccion: custObj?.address || null,
        monto_contado: monto,
        monto_credito: 0,
        monto_total: monto,
        tipo_pago: 'contado',
        observaciones: null,
        hora_visita: inv.date_time,
        fecha_visita: ymd
      });
    }

    // Pagos a crédito del día
    for (const p of creditPayments) {
      const invKey = paymentInvoiceKey ? String(p[paymentInvoiceKey]) : null;
      const inv = invKey ? invoiceByNumber.get(invKey) : null;
      const custObj = inv?.customer_id ? customerMap.get(inv.customer_id) : null;

      const amount = Number(p.amount) || 0;
      totalCredito += amount;
      totalGeneral += amount;

      detalles.push({
        visita_id: p.id ? String(p.id) : (invKey || `${Math.random()}`),
        cliente_id: custObj?.id || null,
        cliente_nombre: custObj?.full_name || null,
        cliente_numero: custObj?.c_number || null,
        cliente_direccion: custObj?.address || null,
        monto_contado: 0,
        monto_credito: amount,
        monto_total: amount,
        tipo_pago: 'credito',
        observaciones: 'ABONO A CRÉDITO',
        hora_visita: p[paymentTimeField] || p.created_at || p.paid_at,
        fecha_visita: ymd
      });
    }

    // Facturas de crédito saldadas ese día (evitar doble conteo si ya hubo pagos contados arriba)
    for (const inv of creditSettledInvoices) {
      const invNum = String(inv.invoice_number ?? inv.id);
      if (paidInvoiceSet.has(invNum)) continue; // ya contada por pagos

      const amount = Number(inv.paid_amount) || 0;
      if (amount <= 0) continue;

      totalCredito += amount;
      totalGeneral += amount;

      const custObj = inv.customer_id ? customerMap.get(inv.customer_id) : null;

      detalles.push({
        visita_id: invNum,
        cliente_id: custObj?.id || null,
        cliente_nombre: custObj?.full_name || null,
        cliente_numero: custObj?.c_number || null,
        cliente_direccion: custObj?.address || null,
        monto_contado: 0,
        monto_credito: amount,
        monto_total: amount,
        tipo_pago: 'credito',
        observaciones: 'FACTURA SALDADA',
        hora_visita: inv.paid_at || inv.date_time,
        fecha_visita: ymd
      });
    }

    // Orden por hora
    detalles.sort((a, b) => {
      const ta = new Date(a.hora_visita).getTime() || 0;
      const tb = new Date(b.hora_visita).getTime() || 0;
      return ta - tb;
    });

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
    const payload = { success: false, message: 'Error interno del servidor' };
    if (process.env.NODE_ENV !== 'production') payload.error = String(e && e.message || e);
    res.status(500).json(payload);
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
// ?estado=pendiente|realizada|en_curso|all (default all -> pendiente+realizada)
// ?date=YYYY-MM-DD (atajo: from=to) | ?from=YYYY-MM-DD&to=YYYY-MM-DD
// ?vendedor_id= &customer_id=
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




