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
let Payment = null;       // No se usa en /cobros (lo cobrado = paid_amount), pero lo dejamos por compatibilidad
let TrainingVideo = null; // Contenido de capacitación

try {
  // Debe exponer: vendedor_id/seller_id, customer_id, invoice_number, date_time, total, payment_method, paid_amount, paid_at
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
 *  Helpers de Zona Horaria para cobros (MySQL/MariaDB)      *
 * ========================================================= */

// Config TZ RD
const RD_TZ = 'America/Santo_Domingo';
const RD_OFFSET = '-04:00'; // fallback si no hay tablas de zona horaria

/**
 * Genera una expresión SQL que compara solo la FECHA local RD de una columna datetime/timestamp
 * Soporta dos modos:
 *  - Si el servidor tiene tablas de tz: CONVERT_TZ(..., @@session.time_zone, 'America/Santo_Domingo')
 *  - Fallback con offset: CONVERT_TZ(..., '+00:00', '-04:00')
 */
const dateLocalEquals = (col, ymd) => literal(
  `(
    (CASE 
       WHEN CONVERT_TZ('2000-01-01 00:00:00','UTC','${RD_TZ}') IS NOT NULL 
       THEN DATE(CONVERT_TZ(${col}, @@session.time_zone, '${RD_TZ}'))
       ELSE DATE(CONVERT_TZ(${col}, '+00:00', '${RD_OFFSET}'))
     END) = '${ymd}'
   )`
);

/* ========================================================= *
 * NUEVAS RUTAS: Capacitación                                *
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
      { id: 1, titulo: 'Cómo hacer un pedido', url: 'https://youtu.be/O-rhnxV6qRc?si=DaUcwAFPCrZHTsvJ', orden: 1, is_active: 1 },
      { id: 2, titulo: 'Cómo cobrar una factura', url: 'https://youtube.com/shorts/rzsKc3G9wvs?si=6CuOtSJbd4Pk1jSu', orden: 2, is_active: 1 },
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
 * 7) Cobros por día (lo cobrado = paid_amount del día RD)   *
 *    Une sin doble conteo:
 *      A) FECHA LOCAL RD de date_time y paid_amount>0
 *      B) FECHA LOCAL RD de paid_at    y paid_amount>0
 *    Monto por detalle = paid_amount; método según payment_method
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

    // Detectar columna de vendedor en invoices
    const sellerCol = Invoice.rawAttributes?.vendedor_id
      ? 'vendedor_id'
      : (Invoice.rawAttributes?.seller_id ? 'seller_id' : null);

    if (!sellerCol) {
      return res.status(500).json({ success: false, message: 'La tabla invoices no tiene vendedor_id/seller_id' });
    }

    // === A) Facturas con FECHA LOCAL RD de date_time y paid_amount > 0
    const invByDateTime = await Invoice.findAll({
      where: {
        [Op.and]: [
          literal(`${sellerCol} = ${Number(vendedorId)}`),
          literal(`COALESCE(paid_amount,0) > 0`),
          dateLocalEquals('date_time', ymd)
        ]
      },
      order: [['date_time','ASC']]
    });

    // === B) Facturas con FECHA LOCAL RD de paid_at y paid_amount > 0
    const invByPaidAt = await Invoice.findAll({
      where: {
        [Op.and]: [
          literal(`${sellerCol} = ${Number(vendedorId)}`),
          literal(`COALESCE(paid_amount,0) > 0`),
          dateLocalEquals('paid_at', ymd)
        ]
      },
      order: [['paid_at','ASC']]
    });

    // Unir sin duplicar por invoice_number/id
    const byKey = new Map();
    const addUnique = (inv) => {
      const key = String(inv.invoice_number ?? inv.id);
      if (!byKey.has(key)) byKey.set(key, inv);
    };
    invByDateTime.forEach(addUnique);
    invByPaidAt.forEach(addUnique);

    const invoices = Array.from(byKey.values());

    // Hidratar clientes
    const customerIds = new Set();
    for (const inv of invoices) if (inv.customer_id) customerIds.add(inv.customer_id);

    const customers = customerIds.size
      ? await Customer.findAll({
          where: { id: Array.from(customerIds) },
          attributes: ['id','full_name','c_number','address']
        })
      : [];
    const customerMap = new Map(customers.map(c => [c.id, c]));

    // Totales y detalles (montos por paid_amount)
    let totalContado = 0, totalCredito = 0, totalGeneral = 0;
    const detalles = [];

    for (const inv of invoices) {
      const amt = Number(inv.paid_amount) || 0;
      if (amt <= 0) continue;

      const method = String(inv.payment_method || '').toLowerCase();
      const esContado = method === 'cash' || method === 'contado';

      if (esContado) totalContado += amt; else totalCredito += amt;
      totalGeneral += amt;

      const cust = inv.customer_id ? customerMap.get(inv.customer_id) : null;

      detalles.push({
        visita_id: String(inv.invoice_number ?? inv.id),
        cliente_id: cust?.id || null,
        cliente_nombre: cust?.full_name || null,
        cliente_numero: cust?.c_number || null,
        cliente_direccion: cust?.address || null,
        monto_contado: esContado ? amt : 0,
        monto_credito: esContado ? 0 : amt,
        monto_total: amt,
        tipo_pago: esContado ? 'contado' : 'credito',
        observaciones: 'COBRO (paid_amount)',
        // Hora de referencia para ordenar (guardamos el crudo)
        hora_visita: inv.paid_at || inv.date_time,
        fecha_visita: ymd
      });
    }

    // Orden cronológico por timestamp crudo
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
      tz_mode: {
        region: RD_TZ,
        fallback_offset_used: false // no podemos detectarlo sin ejecutar un SELECT; dejar fijo u opcional
      },
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



