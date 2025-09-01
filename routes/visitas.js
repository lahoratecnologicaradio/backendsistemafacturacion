const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

const VisitaProgramada = require('../models/VisitaProgramada');
const ResultadoVisita = require('../models/ResultadoVisita');
const Vendedor = require('../models/Vendedor');
const Customer = require('../models/Customer');

/* ===================== *
 *  Helpers de Fechas    *
 * ===================== */

// YYYY-MM-DD con fecha local del servidor (evita desfases por UTC)
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
  return null;
}

const COMMON_INCLUDE = [
  { model: Customer, as: 'cliente', attributes: ['id','full_name','address','c_number'] },
  { model: Vendedor, as: 'vendedor', attributes: ['id','nombre','email'] },
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
        { model: Vendedor, as: 'vendedor', attributes: ['id','nombre','email'] }
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
      vendedor: { id: vendedor.id, nombre: vendedor.nombre, email: vendedor.email },
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
 *    (Versión consolidada: NO duplicada)                    *
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

    // Actualizar visita como realizada si corresponde
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
 * 7) Cobros de un vendedor en una fecha                     *
 * ========================================================= */
router.get('/cobros/:vendedorId/:fecha', async (req, res) => {
  try {
    const { vendedorId, fecha } = req.params;
    const ymd = normalizeToYMD(fecha);
    if (!ymd) return res.status(400).json({ success: false, message: 'Fecha inválida' });

    const vendedor = await Vendedor.findByPk(vendedorId);
    if (!vendedor) return res.status(404).json({ success: false, message: 'Vendedor no encontrado' });

    const realizadas = await VisitaProgramada.findAll({
      where: { vendedor_id: vendedorId, fecha_programada: ymd, estado: 'realizada' },
      include: [
        { model: Customer, as: 'cliente', attributes: ['id','full_name','c_number','address'] },
        { model: ResultadoVisita, as: 'resultado', required: true }
      ],
      order: [['hora_programada','ASC']]
    });

    let totalContado = 0, totalCredito = 0, totalGeneral = 0;
    const detalles = [];

    realizadas.forEach(v => {
      const r = v.resultado || {};
      const contado = parseFloat(r.monto_contado) || 0;
      const credito = parseFloat(r.monto_credito) || 0;
      const total = parseFloat(r.monto_total) || (contado + credito);
      totalContado += contado;
      totalCredito += credito;
      totalGeneral += total;
      detalles.push({
        visita_id: v.id,
        cliente_id: v.cliente.id,
        cliente_nombre: v.cliente.full_name,
        cliente_numero: v.cliente.c_number,
        cliente_direccion: v.cliente.address,
        monto_contado: contado,
        monto_credito: credito,
        monto_total: total,
        tipo_pago: r.tipo_pago,
        observaciones: r.observaciones,
        hora_visita: v.hora_programada,
        fecha_visita: v.fecha_programada
      });
    });

    res.json({
      success: true,
      fecha: ymd,
      vendedor: { id: vendedor.id, nombre: vendedor.nombre, email: vendedor.email },
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
    console.error('GET /visitas/cobros/:vendedorId/:fecha', e);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

/* ========================================================= *
 * 8) Listados generales (/hoy, /dia/:fecha, /list)          *
 * ========================================================= */

// HOY: pendientes + realizadas de TODOS
router.get('/hoy', async (_req, res) => {
  try {
    const today = todayYMDLocal();
    const visitas = await VisitaProgramada.findAll({
      where: { fecha_programada: today, estado: { [Op.in]: ['pendiente','realizada'] } },
      include: COMMON_INCLUDE,
      order: [['hora_programada','ASC'], ['prioridad','DESC']]
    });
    res.json({ success: true, fecha: today, count: visitas.length, data: visitas });
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
// ?date=YYYY-MM-DD (atajo: from=to)
// ?from=YYYY-MM-DD&to=YYYY-MM-DD
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
