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
          as: 'resultados',
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
          as: 'resultados',
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

module.exports = router;