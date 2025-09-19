// routes/visitas.js
'use strict';

const express = require('express');
const router = express.Router();
const { Op, literal } = require('sequelize');

const VisitaProgramada = require('../models/VisitaProgramada');
const ResultadoVisita  = require('../models/ResultadoVisita');
const Vendedor         = require('../models/Vendedor');
const Customer         = require('../models/Customer');

// ⚠️ Estos dos se cargan en try/catch para no romper si faltan.
// Para /cobros solo usamos Invoice.
let Invoice = null;
let Payment = null;
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
 * 7) Cobros por día (VENTAS reales por facturas con total>0)
 *    - Busca en invoices del vendedor con DATE(date_time)=fecha
 *    - Solo cuenta total > 0
 *    - Separa por contado vs crédito según payment_method
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

    // Detectar columna de vendedor en invoices (vendedor_id o seller_id)
    const sellerCol = Invoice.rawAttributes?.vendedor_id
      ? 'vendedor_id'
      : (Invoice.rawAttributes?.seller_id ? 'seller_id' : null);

    if (!sellerCol) {
      return res.status(500).json({ success: false, message: 'La tabla invoices no tiene vendedor_id/seller_id' });
    }

    // Traer TODAS las facturas del vendedor con total > 0 en la FECHA enviada
    // Usamos DATE(date_time)='YYYY-MM-DD' como solicitaste.
    const invoices = await Invoice.findAll({
      where: literal(`
        ${sellerCol}=${Number(vendedorId)}
        AND total > 0
        AND DATE(date_time)='${ymd}'
      `),
      order: [['date_time','ASC']]
    });

    // Hidratar clientes (opcional; mostrará nombre/dir si existe customer_id)
    const customerIds = new Set();
    for (const inv of invoices) if (inv.customer_id) customerIds.add(inv.customer_id);

    const customers = customerIds.size
      ? await Customer.findAll({
          where: { id: Array.from(customerIds) },
          attributes: ['id','full_name','c_number','address']
        })
      : [];
    const customerMap = new Map(customers.map(c => [c.id, c]));

    // Armar totales/detalles
    let totalContado = 0, totalCredito = 0, totalGeneral = 0;
    const detalles = [];

    for (const inv of invoices) {
      const monto  = Number(inv.total) || 0;
      const method = String(inv.payment_method || '').toLowerCase();
      const cust   = inv.customer_id ? customerMap.get(inv.customer_id) : null;

      const esContado = (method === 'cash' || method === 'contado');
      if (esContado) totalContado += monto; else totalCredito += monto;
      totalGeneral += monto;

      detalles.push({
        visita_id: String(inv.invoice_number ?? inv.id),
        cliente_id: cust?.id || null,
        cliente_nombre: cust?.full_name || null,
        cliente_numero: cust?.c_number || null,
        cliente_direccion: cust?.address || null,
        monto_contado: esContado ? monto : 0,
        monto_credito: esContado ? 0 : monto,
        monto_total: monto,
        tipo_pago: esContado ? 'contado' : 'credito',
        observaciones: 'FACTURA',
        hora_visita: inv.date_time,
        fecha_visita: ymd
      });
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
