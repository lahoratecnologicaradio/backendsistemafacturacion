const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const { sequelize } = require('../db');
const Invoice = require('../models/Invoice');

// ROUTE-1: Obtener todas las facturas/ventas
router.get('/fetchallsales', async (req, res) => {
  try {
    console.log('🔍 Iniciando fetchallsales...');
    
    // Verificar conexión
    await sequelize.authenticate();
    console.log('✅ Conexión a BD exitosa');

    // Buscar todas las facturas
    const invoices = await Invoice.findAll({
      order: [['date_time', 'DESC']]
    });
    
    console.log(`✅ ${invoices.length} facturas encontradas`);
    res.json(invoices);

  } catch (error) {
    console.error('❌ ERROR en fetchallsales:', error.message);
    console.error('📌 STACK:', error.stack);
    
    res.status(500).json({ 
      error: 'Internal Server Error',
      details: error.message,
      code: error.code
    });
  }
});

// ROUTE-2: Agregar nueva factura/venta
router.post('/addsale', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await transaction.rollback();
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { invoice_number, date_time, customer_name, total, cash, change } = req.body;
    
    // Validar datos requeridos
    if (!invoice_number || !date_time || !customer_name || total === undefined || cash === undefined || change === undefined) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    // Crear la factura
    const invoice = await Invoice.create({
      invoice_number,
      date_time,
      customer_name,
      total,
      cash,
      change
    }, { transaction });

    // Confirmar la transacción
    await transaction.commit();

    res.status(201).json(invoice);

  } catch (error) {
    // Revertir la transacción en caso de error
    if (transaction.finished !== 'commit') {
      await transaction.rollback();
    }
    
    console.error('❌ Error al crear factura:', error.message);
    console.error('📌 STACK:', error.stack);
    
    // Manejar error de duplicado
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ 
        error: 'Número de factura duplicado',
        details: 'El número de factura ya existe en el sistema'
      });
    }
    
    res.status(500).json({ 
      error: 'Error al crear factura',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// ROUTE-3: Obtener factura por ID
router.get('/getsale/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    
    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error al obtener factura:', error);
    res.status(500).json({ 
      error: 'Error al obtener factura',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// ROUTE-4: Actualizar factura
router.put('/updatesale/:id', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const { invoice_number, date_time, customer_name, total, cash, change } = req.body;

    // Validar datos
    if (!invoice_number || !date_time || !customer_name || total === undefined || cash === undefined || change === undefined) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    // Actualizar datos de la factura
    await invoice.update({
      invoice_number,
      date_time,
      customer_name,
      total,
      cash,
      change
    }, { transaction });

    await transaction.commit();

    res.json(invoice);

  } catch (error) {
    if (transaction.finished !== 'commit') {
      await transaction.rollback();
    }
    
    console.error('Error al actualizar factura:', error);
    
    // Manejar error de duplicado
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ 
        error: 'Número de factura duplicado',
        details: 'El número de factura ya existe en el sistema'
      });
    }
    
    res.status(500).json({ 
      error: 'Error al actualizar factura',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// ROUTE-5: Eliminar factura
router.delete('/deletesale/:id', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    // Eliminar la factura
    await Invoice.destroy({ 
      where: { id: req.params.id },
      transaction 
    });

    await transaction.commit();
    res.json({ success: true, message: 'Factura eliminada correctamente' });

  } catch (error) {
    if (transaction.finished !== 'commit') {
      await transaction.rollback();
    }
    
    console.error('Error al eliminar factura:', error);
    res.status(500).json({ 
      error: 'Error al eliminar factura',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// ROUTE-6: Obtener factura por número de factura
router.get('/getbyinvoice/:invoice_number', async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      where: { invoice_number: req.params.invoice_number }
    });
    
    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error al buscar factura:', error);
    res.status(500).json({ 
      error: 'Error al buscar factura',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// ROUTE-7: Obtener estadísticas de ventas por vendedor
// ROUTE-7: Obtener estadísticas de ventas por vendedor (VERSIÓN CORREGIDA)
router.post('/vendedor-stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    // Construir la condición WHERE basada en las fechas proporcionadas
    let whereCondition = '';
    let queryParams = [];
    
    if (startDate && endDate) {
      whereCondition = 'WHERE i.date_time BETWEEN ? AND ?';
      queryParams = [startDate, endDate + ' 23:59:59'];
    } else if (startDate) {
      whereCondition = 'WHERE i.date_time >= ?';
      queryParams = [startDate];
    } else if (endDate) {
      whereCondition = 'WHERE i.date_time <= ?';
      queryParams = [endDate + ' 23:59:59'];
    }

    // CONSULTA CORREGIDA - Usando los nombres de columnas correctos
    const query = `
      SELECT 
        i.vendedor_id,
        COUNT(i.invoice_number) as cantidad_ventas,
        SUM(i.total) as total_ventas
      FROM invoices i
      ${whereCondition}
      GROUP BY i.vendedor_id
      ORDER BY total_ventas DESC
    `;

    console.log('Ejecutando consulta:', query);
    console.log('Con parámetros:', queryParams);

    // Ejecutar la consulta
    const [results] = await sequelize.query(query, {
      replacements: queryParams,
      type: sequelize.QueryTypes.SELECT
    });

    // Formatear la respuesta
    const stats = Array.isArray(results) ? results : (results ? [results] : []);
    
    res.json({
      success: true,
      data: stats.filter(item => item && item.vendedor_id !== null)
    });

  } catch (error) {
    console.error('❌ ERROR en vendedor-stats:', error.message);
    console.error('📌 STACK:', error.stack);
    
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener estadísticas de ventas',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

module.exports = router;