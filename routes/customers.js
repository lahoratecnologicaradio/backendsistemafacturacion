const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const { sequelize } = require('../db');
const Customer = require('../models/Customer');

// ROUTE-1: Obtener todos los clientes
router.get('/fetchallcustomers', async (req, res) => {
  try {
    console.log('🔍 INICIANDO DIAGNÓSTICO COMPLETO...');
    
    // 1. Verificar conexión
    await sequelize.authenticate();
    console.log('✅ Conexión a BD exitosa');

    // 2. Verificar que la tabla existe con consulta directa
    const [results] = await sequelize.query('SELECT COUNT(*) as count FROM customers');
    console.log('📊 Registros en tabla customers:', results[0].count);

    // 3. Verificar estructura REAL de la tabla en MySQL
    console.log('🔍 Obteniendo estructura real de la tabla...');
    const [tableStructure] = await sequelize.query('DESCRIBE customers');
    //console.log('📋 Estructura real de customers:', tableStructure);

    // 4. Verificar estructura del MODELO Sequelize
    console.log('🔍 Estructura del modelo Customer:');
    console.log('Nombre de tabla:', Customer.tableName);
    console.log('Columnas del modelo:', Object.keys(Customer.rawAttributes));
    
    // 5. Comparar columnas
    const modelColumns = Object.keys(Customer.rawAttributes);
    const realColumns = tableStructure.map(col => col.Field);
    
    console.log('🔍 Comparación de columnas:');
    console.log('Modelo:', modelColumns);
    console.log('Real:  ', realColumns);
    
    // 6. Buscar diferencias
    const missingInModel = realColumns.filter(col => !modelColumns.includes(col));
    const missingInReal = modelColumns.filter(col => !realColumns.includes(col));
    
    console.log('❌ Columnas en tabla pero no en modelo:', missingInModel);
    console.log('❌ Columnas en modelo pero no en tabla:', missingInReal);

    // 7. Intentar consulta específica
    console.log('🔍 Probando consulta específica...');
    const [sampleData] = await sequelize.query('SELECT * FROM customers LIMIT 1');
    console.log('📊 Datos de muestra:', sampleData);

    // 8. Solo entonces intentar findAll
    console.log('🔍 Intentando findAll...');
    const customers = await Customer.findAll();
    console.log(`✅ Clientes encontrados vía Sequelize: ${customers.length}`);
    
    res.json(customers);
  } catch (error) {
    console.error('❌ ERROR COMPLETO:', error);
    console.error('📌 STACK:', error.stack);
    res.status(500).json({ 
      error: 'Error del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Contacte al administrador 2'
    });
  }
});

// ROUTE-2: Agregar nuevo cliente
router.post('/addcustomer', async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const customer = await Customer.create(req.body);
    res.status(201).json(customer);
  } catch (error) {
    console.error('Error al crear cliente:', error);
    res.status(500).json({ 
      error: 'Error al crear cliente',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// ROUTE-3: Actualizar cliente
router.put('/updatecustomer/:id', async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    await customer.update(req.body);
    res.json(customer);
  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    res.status(500).json({ 
      error: 'Error al actualizar cliente',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// ROUTE-4: Eliminar cliente
router.delete('/deletecustomer/:id', async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    await customer.destroy();
    res.json({ success: true, message: 'Cliente eliminado' });
  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    res.status(500).json({ 
      error: 'Error al eliminar cliente',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

module.exports = router;