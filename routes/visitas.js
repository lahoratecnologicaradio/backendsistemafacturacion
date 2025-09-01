const express = require('express');
const router = express.Router();
const VisitaProgramada = require('../models/VisitaProgramada');
const ResultadoVisita = require('../models/ResultadoVisita');
const Vendedor = require('../models/Vendedor');
const Customer = require('../models/Customer');
const { Op } = require('sequelize');

// 1. Endpoint para planificar rutas (agregar visitas programadas)
router.post('/planificar', async (req, res) => {
  try {
    const { vendedor_id, customer_id, fecha_programada, hora_programada, prioridad, observaciones } = req.body;

    // Validar datos requeridos
    if (!vendedor_id || !customer_id || !fecha_programada) {
      return res.status(400).json({
        success: false,
        message: 'Vendedor, cliente y fecha son requeridos'
      });
    }

    // Verificar si el vendedor existe
    const vendedor = await Vendedor.findByPk(vendedor_id);
    if (!vendedor) {
      return res.status(404).json({
        success: false,
        message: 'Vendedor no encontrado'
      });
    }

    // Verificar si el cliente existe
    const cliente = await Customer.findByPk(customer_id);
    if (!cliente) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }

    // Verificar si ya existe una visita programada para la misma fecha
    const existingVisita = await VisitaProgramada.findOne({
      where: {
        vendedor_id,
        customer_id,
        fecha_programada
      }
    });

    if (existingVisita) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una visita programada para este cliente en la fecha seleccionada'
      });
    }

    const visita = await VisitaProgramada.create({
      vendedor_id,
      customer_id,
      fecha_programada,
      hora_programada,
      prioridad: prioridad || 'media',
      observaciones,
      estado: 'pendiente'
    });

    res.status(201).json({
      success: true,
      message: 'Visita programada exitosamente',
      data: visita
    });

  } catch (error) {
    console.error('Error al planificar visita:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// 2. Endpoint para ver clientes pendientes por visitar por un vendedor
router.get('/pendientes/:vendedorId/:fecha', async (req, res) => {
  try {
    const { vendedorId, fecha } = req.params;

    // Verificar si el vendedor existe
    const vendedor = await Vendedor.findByPk(vendedorId);
    if (!vendedor) {
      return res.status(404).json({
        success: false,
        message: 'Vendedor no encontrado'
      });
    }

    const visitasPendientes = await VisitaProgramada.findAll({
      where: {
        vendedor_id: vendedorId,
        fecha_programada: fecha,
        estado: 'pendiente'
      },
      include: [
        {
          model: Customer,
          as: 'cliente',
          attributes: ['id', 'full_name', 'address', 'c_number', 'product_name', 'total', 'due_date']
        },
        {
          model: Vendedor,
          as: 'vendedor',
          attributes: ['id', 'nombre', 'email']
        }
      ],
      order: [
        ['prioridad', 'DESC'],
        ['hora_programada', 'ASC']
      ]
    });

    res.json({
      success: true,
      fecha: fecha,
      vendedor: vendedor.nombre,
      total_pendientes: visitasPendientes.length,
      data: visitasPendientes
    });

  } catch (error) {
    console.error('Error al obtener visitas pendientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// 3. Endpoint para ver visitas realizadas por un vendedor
router.get('/realizadas/:vendedorId/:fecha', async (req, res) => {
  try {
    const { vendedorId, fecha } = req.params;

    // Verificar si el vendedor existe
    const vendedor = await Vendedor.findByPk(vendedorId);
    if (!vendedor) {
      return res.status(404).json({
        success: false,
        message: 'Vendedor no encontrado'
      });
    }

    const visitasRealizadas = await VisitaProgramada.findAll({
      where: {
        vendedor_id: vendedorId,
        fecha_programada: fecha,
        estado: 'realizada'
      },
      include: [
        {
          model: Customer,
          as: 'cliente',
          attributes: ['id', 'full_name', 'address', 'c_number', 'product_name']
        },
        {
          model: ResultadoVisita,
          as: 'resultado',
          required: false
        },
        {
          model: Vendedor,
          as: 'vendedor',
          attributes: ['id', 'nombre', 'email']
        }
      ],
      order: [
        ['fecha_realizacion', 'DESC']
      ]
    });

    res.json({
      success: true,
      fecha: fecha,
      vendedor: vendedor.nombre,
      total_realizadas: visitasRealizadas.length,
      data: visitasRealizadas
    });

  } catch (error) {
    console.error('Error al obtener visitas realizadas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// 4. NUEVO ENDPOINT: Mostrar visitas realizadas y pendientes de un vendedor en un día específico
// 4. Endpoint para mostrar visitas realizadas y pendientes de un vendedor en un día específico
router.get('/resumen-dia/:vendedorId/:fecha', async (req, res) => {
    try {
      const { vendedorId, fecha } = req.params;
  
      // Verificar si el vendedor existe
      const vendedor = await Vendedor.findByPk(vendedorId);
      if (!vendedor) {
        return res.status(404).json({
          success: false,
          message: 'Vendedor no encontrado'
        });
      }
  
      // Obtener todas las visitas del día (realizadas y pendientes)
      const visitasDelDia = await VisitaProgramada.findAll({
        where: {
          vendedor_id: vendedorId,
          fecha_programada: fecha
        },
        include: [
          {
            model: Customer,
            as: 'cliente',
            attributes: ['id', 'full_name', 'address', 'c_number', 'product_name', 'total', 'due_date']
          },
          {
            model: ResultadoVisita,
            as: 'resultado',
            required: false,
            attributes: [ // Especificar explícitamente los atributos
              'id', 
              'visita_id', 
              'interes_cliente', 
              'probabilidad_venta', 
              'productos_interes', 
              'pedido_realizado', 
              'monto_potencial', 
              'observaciones', 
              'proxima_visita',
              'created_at'
            ]
          },
          {
            model: Vendedor,
            as: 'vendedor',
            attributes: ['id', 'nombre', 'email']
          }
        ],
        order: [
          ['estado', 'ASC'],
          ['prioridad', 'DESC'],
          ['hora_programada', 'ASC']
        ]
      });
  
      // Separar en realizadas y pendientes
      const visitasRealizadas = visitasDelDia.filter(visita => visita.estado === 'realizada');
      const visitasPendientes = visitasDelDia.filter(visita => visita.estado === 'pendiente');
  
      // Calcular estadísticas
      const totalVisitas = visitasDelDia.length;
      const porcentajeRealizadas = totalVisitas > 0 ? (visitasRealizadas.length / totalVisitas) * 100 : 0;
  
      // Calcular monto potencial total de visitas realizadas
      const montoPotencialTotal = visitasRealizadas.reduce((total, visita) => {
        if (visita.resultado && visita.resultado.monto_potencial) {
          return total + parseFloat(visita.resultado.monto_potencial);
        }
        return total;
      }, 0);
  
      res.json({
        success: true,
        fecha: fecha,
        vendedor: {
          id: vendedor.id,
          nombre: vendedor.nombre,
          email: vendedor.email
        },
        resumen: {
          total_visitas: totalVisitas,
          realizadas: visitasRealizadas.length,
          pendientes: visitasPendientes.length,
          porcentaje_realizadas: Math.round(porcentajeRealizadas),
          monto_potencial_total: montoPotencialTotal.toFixed(2)
        },
        visitas_realizadas: visitasRealizadas,
        visitas_pendientes: visitasPendientes
      });
  
    } catch (error) {
      console.error('Error al obtener resumen del día:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : null
      });
    }
  });

// 5. Endpoint para registrar resultado de visita (modificado)
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
        proxima_visita 
      } = req.body;
  
      let visita;
  
      // Si se proporciona visita_id, usarla directamente
      if (visita_id) {
        visita = await VisitaProgramada.findByPk(visita_id);
      } 
      // Si no hay visita_id pero sí vendedor_id y customer_id, buscar o crear visita
      else if (vendedor_id && customer_id) {
        const fechaHoy = new Date().toISOString().split('T')[0];
        
        visita = await VisitaProgramada.findOne({
          where: {
            vendedor_id,
            customer_id,
            fecha_programada: fechaHoy
          }
        });
  
        if (!visita) {
          visita = await VisitaProgramada.create({
            vendedor_id,
            customer_id,
            fecha_programada: fechaHoy,
            estado: 'pendiente',
            prioridad: 'media'
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'Se requiere visita_id o (vendedor_id y customer_id)'
        });
      }
  
      if (!visita) {
        return res.status(404).json({
          success: false,
          message: 'Visita no encontrada'
        });
      }
  
      // Actualizar estado de la visita si se realizó una venta
      if (pedido_realizado) {
        await visita.update({
          estado: 'realizada',
          fecha_realizacion: new Date()
        });
      }
  
      // Registrar resultado
      const resultado = await ResultadoVisita.create({
        visita_id: visita.id,
        interes_cliente: interes_cliente || 'medio',
        probabilidad_venta: probabilidad_venta || 'media',
        productos_interes: productos_interes || '',
        pedido_realizado: pedido_realizado || false,
        monto_potencial: monto_potencial || 0,
        observaciones: observaciones || '',
        proxima_visita: proxima_visita || null
      });
  
      res.json({
        success: true,
        message: 'Resultado de visita registrado exitosamente',
        data: resultado
      });
  
    } catch (error) {
      console.error('Error al registrar resultado:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : null
      });
    }
  });

// 5. Endpoint para registrar resultado de visita
router.post('/registrar-resultado', async (req, res) => {
  try {
    const { visita_id, interes_cliente, probabilidad_venta, productos_interes, pedido_realizado, monto_potencial, observaciones, proxima_visita } = req.body;

    // Verificar si la visita existe
    const visita = await VisitaProgramada.findByPk(visita_id);
    if (!visita) {
      return res.status(404).json({
        success: false,
        message: 'Visita no encontrada'
      });
    }

    // Actualizar estado de la visita
    await visita.update({
      estado: 'realizada',
      fecha_realizacion: new Date()
    });

    // Registrar resultado
    const resultado = await ResultadoVisita.create({
      visita_id,
      interes_cliente,
      probabilidad_venta,
      productos_interes,
      pedido_realizado,
      monto_potencial,
      observaciones,
      proxima_visita
    });

    res.json({
      success: true,
      message: 'Resultado de visita registrado exitosamente',
      data: resultado
    });

  } catch (error) {
    console.error('Error al registrar resultado:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// 6. Endpoint para obtener historial de visitas de un vendedor
router.get('/historial/:vendedorId', async (req, res) => {
  try {
    const { vendedorId } = req.params;
    const { fecha } = req.query;

    let whereClause = { vendedor_id: vendedorId };
    
    if (fecha) {
      whereClause.fecha_programada = fecha;
    }

    const visitas = await VisitaProgramada.findAll({
      where: whereClause,
      include: [
        {
          model: Customer,
          as: 'cliente',
          attributes: ['id', 'full_name', 'address']
        },
        {
          model: ResultadoVisita,
          as: 'resultado',
          required: false
        }
      ],
      order: [['fecha_programada', 'DESC'], ['hora_programada', 'ASC']],
      limit: 50
    });

    res.json({
      success: true,
      count: visitas.length,
      data: visitas
    });

  } catch (error) {
    console.error('Error al obtener historial:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// Endpoint para obtener cobros de un vendedor en un día específico
router.get('/cobros/:vendedorId/:fecha', async (req, res) => {
  try {
    const { vendedorId, fecha } = req.params;

    // Verificar si el vendedor existe
    const vendedor = await Vendedor.findByPk(vendedorId);
    if (!vendedor) {
      return res.status(404).json({
        success: false,
        message: 'Vendedor no encontrado'
      });
    }

    // Obtener todas las visitas realizadas por el vendedor en la fecha especificada
    const visitasRealizadas = await VisitaProgramada.findAll({
      where: {
        vendedor_id: vendedorId,
        fecha_programada: fecha,
        estado: 'realizada'
      },
      include: [
        {
          model: Customer,
          as: 'cliente',
          attributes: ['id', 'full_name', 'c_number', 'address']
        },
        {
          model: ResultadoVisita,
          as: 'resultado',
          required: true,
          where: {
            pedido_realizado: true,
            [Op.or]: [
              { monto_contado: { [Op.gt]: 0 } },
              { monto_credito: { [Op.gt]: 0 } }
            ]
          }
        }
      ],
      order: [['hora_programada', 'ASC']]
    });

    // Calcular totales
    let totalContado = 0;
    let totalCredito = 0;
    let totalGeneral = 0;
    
    // Array para almacenar detalles de cobros
    const detallesCobros = [];

    visitasRealizadas.forEach(visita => {
      if (visita.resultado) { // ✅ Cambiado: resultado es objeto, no array
        const resultado = visita.resultado;
        const montoContado = parseFloat(resultado.monto_contado) || 0;
        const montoCredito = parseFloat(resultado.monto_credito) || 0;
        const montoTotal = parseFloat(resultado.monto_total) || (montoContado + montoCredito);
        
        totalContado += montoContado;
        totalCredito += montoCredito;
        totalGeneral += montoTotal;
        
        detallesCobros.push({
          visita_id: visita.id,
          cliente_id: visita.cliente.id,
          cliente_nombre: visita.cliente.full_name,
          cliente_numero: visita.cliente.c_number,
          cliente_direccion: visita.cliente.address,
          monto_contado: montoContado,
          monto_credito: montoCredito,
          monto_total: montoTotal,
          tipo_pago: resultado.tipo_pago,
          observaciones: resultado.observaciones,
          hora_visita: visita.hora_programada,
          fecha_visita: visita.fecha_programada
        });
      }
    });

    res.json({
      success: true,
      fecha: fecha,
      vendedor: {
        id: vendedor.id,
        nombre: vendedor.nombre,
        email: vendedor.email
      },
      resumen_cobros: {
        total_contado: totalContado.toFixed(2),
        total_credito: totalCredito.toFixed(2),
        total_general: totalGeneral.toFixed(2),
        cantidad_ventas: detallesCobros.length,
        promedio_venta: detallesCobros.length > 0 ? (totalGeneral / detallesCobros.length).toFixed(2) : 0
      },
      detalles_cobros: detallesCobros
    });

  } catch (error) {
    console.error('Error al obtener cobros del vendedor:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// 6. Endpoint para registrar resultado de visita por datos (vendedor, cliente, fecha)
router.post('/registrar-resultado-por-datos', async (req, res) => {
  try {
    const { 
      vendedor_id, 
      customer_id, 
      fecha_visita, 
      interes_cliente, 
      probabilidad_venta, 
      productos_interes, 
      pedido_realizado, 
      monto_potencial, 
      observaciones, 
      proxima_visita,
      duracion_visita,
      hora_realizacion
    } = req.body;

    // Validar datos requeridos
    if (!vendedor_id || !customer_id || !fecha_visita) {
      return res.status(400).json({
        success: false,
        message: 'vendedor_id, customer_id y fecha_visita son requeridos'
      });
    }

    // Validar tipos de datos
    if (isNaN(Number(vendedor_id)) || isNaN(Number(customer_id))) {
      return res.status(400).json({
        success: false,
        message: 'vendedor_id y customer_id deben ser números válidos'
      });
    }

    // Validar formato de fecha
    const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!fechaRegex.test(fecha_visita)) {
      return res.status(400).json({
        success: false,
        message: 'fecha_visita debe tener formato YYYY-MM-DD'
      });
    }

    // Convertir y validar duración
    let duracionMinutos = null;
    if (duracion_visita !== undefined && duracion_visita !== null) {
      if (typeof duracion_visita === 'string') {
        if (duracion_visita.includes(':')) {
          // Formato HH:MM:SS
          const timeParts = duracion_visita.split(':');
          if (timeParts.length !== 3) {
            return res.status(400).json({
              success: false,
              message: 'duracion_visita en formato HH:MM:SS debe tener 3 componentes'
            });
          }
          const [hours, minutes, seconds] = timeParts.map(Number);
          if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
            return res.status(400).json({
              success: false,
              message: 'duracion_visita contiene valores no numéricos'
            });
          }
          duracionMinutos = hours * 60 + minutes;
        } else {
          // String numérico
          duracionMinutos = parseInt(duracion_visita, 10);
          if (isNaN(duracionMinutos)) {
            return res.status(400).json({
              success: false,
              message: 'duracion_visita debe ser un número válido'
            });
          }
        }
      } else if (typeof duracion_visita === 'number') {
        duracionMinutos = duracion_visita;
      } else {
        return res.status(400).json({
          success: false,
          message: 'duracion_visita debe ser un número o string en formato HH:MM:SS'
        });
      }

      // Validar rango de duración (1 minuto a 24 horas)
      if (duracionMinutos < 1 || duracionMinutos > 1440) {
        return res.status(400).json({
          success: false,
          message: 'duracion_visita debe estar entre 1 y 1440 minutos (24 horas)'
        });
      }
    }

    // Validar hora_realizacion si se proporciona
    if (hora_realizacion && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(hora_realizacion)) {
      return res.status(400).json({
        success: false,
        message: 'hora_realizacion debe tener formato HH:MM:SS'
      });
    }

    // Validar monto_potencial si se proporciona
    if (monto_potencial !== undefined && monto_potencial !== null) {
      const monto = parseFloat(monto_potencial);
      if (isNaN(monto) || monto < 0) {
        return res.status(400).json({
          success: false,
          message: 'monto_potencial debe ser un número positivo'
        });
      }
    }

    // Buscar la visita programada
    const visita = await VisitaProgramada.findOne({
      where: {
        vendedor_id: Number(vendedor_id),
        customer_id: Number(customer_id),
        fecha_programada: fecha_visita,
        estado: 'pendiente'
      }
    });

    if (!visita) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró una visita pendiente para estos datos'
      });
    }

    // Preparar datos de actualización
    const updateData = {
      estado: 'realizada',
      fecha_realizacion: new Date(),
      updated_at: new Date()
    };

    // Campos opcionales
    if (duracionMinutos !== null) updateData.duracion_visita = duracionMinutos;
    if (hora_realizacion) updateData.hora_realizacion = hora_realizacion;
    if (observaciones) {
      updateData.observaciones = visita.observaciones 
        ? `${visita.observaciones} | ${observaciones}`
        : observaciones;
    }

    // Actualizar visita
    await visita.update(updateData);

    // Validar campos para el resultado
    const camposRequeridosResultado = ['interes_cliente', 'probabilidad_venta'];
    for (const campo of camposRequeridosResultado) {
      if (!req.body[campo]) {
        return res.status(400).json({
          success: false,
          message: `${campo} es requerido para registrar el resultado`
        });
      }
    }

    // Registrar resultado
    const resultado = await ResultadoVisita.create({
      visita_id: visita.id,
      interes_cliente: interes_cliente,
      probabilidad_venta: probabilidad_venta,
      productos_interes: productos_interes || 'Venta realizada',
      pedido_realizado: pedido_realizado !== undefined ? Boolean(pedido_realizado) : true,
      monto_potencial: monto_potencial ? parseFloat(monto_potencial) : 0,
      observaciones: observaciones || 'Factura generada',
      proxima_visita: proxima_visita || null
    });

    res.json({
      success: true,
      message: 'Visita actualizada y resultado registrado exitosamente',
      data: {
        visita: visita,
        resultado: resultado
      }
    });

  } catch (error) {
    console.error('Error al registrar resultado por datos:', error);
    
    // Manejar errores específicos de la base de datos
    if (error.name === 'SequelizeValidationError') {
      const errores = error.errors.map(err => ({
        campo: err.path,
        mensaje: err.message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Error de validación en los datos',
        errores: errores
      });
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        message: 'Ya existe un registro con estos datos'
      });
    }

    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Error de referencia: vendedor_id o customer_id no existen'
      });
    }

    // Error general del servidor
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al procesar la solicitud',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// =====================
// NUEVOS ENDPOINTS
// =====================

// GET /api/visitas/list
// Lista visitas (por defecto HOY) con filtros:
//   ?estado=pendiente|realizada|all  (default: all -> pendiente+realizada)
//   ?from=YYYY-MM-DD                 (default: hoy)
//   ?to=YYYY-MM-DD                   (default: hoy)
//   ?vendedor_id=NUMBER              (opcional)
//   ?customer_id=NUMBER              (opcional)
//
// Devuelve array plano con include de vendedor y cliente.
// Además, añade campos calculados: days_left, is_urgent (<=3 días), is_past.
router.get('/list', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const {
      estado = 'all',
      from = today,
      to = today,
      vendedor_id,
      customer_id
    } = req.query;

    const where = {
      fecha_programada: {
        [Op.between]: [from, to]
      }
    };

    // estado: all -> pendiente + realizada
    if (estado !== 'all') {
      where.estado = estado;
    } else {
      where.estado = { [Op.in]: ['pendiente', 'realizada'] };
    }

    if (vendedor_id) where.vendedor_id = Number(vendedor_id);
    if (customer_id) where.customer_id = Number(customer_id);

    const visitas = await VisitaProgramada.findAll({
      where,
      include: [
        {
          model: Customer,
          as: 'cliente',
          attributes: ['id', 'full_name', 'address', 'c_number']
        },
        {
          model: Vendedor,
          as: 'vendedor',
          attributes: ['id', 'nombre', 'email']
        },
        {
          model: ResultadoVisita,
          as: 'resultado',
          required: false
        }
      ],
      order: [
        ['fecha_programada', 'ASC'],
        ['hora_programada', 'ASC'],
        ['prioridad', 'DESC']
      ]
    });

    // Anexar flags útiles para el front
    const todayDate = new Date(today);
    const withFlags = visitas.map(v => {
      const d = new Date(v.fecha_programada + 'T00:00:00Z');
      const diffMs = d - todayDate; // futuro => positivo
      const days_left = Math.round(diffMs / (1000 * 60 * 60 * 24));
      const is_past = days_left < 0 && v.estado === 'pendiente';
      const is_urgent = v.estado === 'pendiente' && days_left >= 0 && days_left <= 3;
      return {
        ...v.toJSON(),
        days_left,
        is_urgent,
        is_past
      };
    });

    res.json({
      success: true,
      filters: { estado, from, to, vendedor_id: vendedor_id ? Number(vendedor_id) : null, customer_id: customer_id ? Number(customer_id) : null },
      count: withFlags.length,
      data: withFlags
    });

  } catch (error) {
    console.error('Error en GET /visitas/list:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// DELETE /api/visitas/:id
// Elimina una visita (próxima o pasada). Útil para limpiar o reprogramar.
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const visita = await VisitaProgramada.findByPk(id);
    if (!visita) {
      return res.status(404).json({ success: false, message: 'Visita no encontrada' });
    }
    await visita.destroy();
    res.json({ success: true, message: 'Visita eliminada' });
  } catch (error) {
    console.error('Error al eliminar visita:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});


module.exports = router;
