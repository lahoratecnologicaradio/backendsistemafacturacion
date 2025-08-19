const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const { sequelize } = require('../db');
const Customer = require('../models/Customer');


// ROUTE-1: Obtener todos los clientes
router.get('/fetchallcustomers', async (req, res) => {
  try {
    console.log('🔍 Iniciando fetchallcustomers...');
    
    // 1. Verificar que el modelo Customer existe
    console.log('📋 Modelo Customer:', Customer ? 'OK' : 'NO DEFINIDO');
    
    // 2. Verificar conexión a la BD
    await sequelize.authenticate();
    console.log('✅ Conexión a BD exitosa');
    
    // 3. Verificar que la tabla existe
    const tables = await sequelize.getQueryInterface().showAllTables();
    console.log('📊 Tablas en la BD:', tables);
    
    const customerTableExists = tables.some(table => table.toLowerCase() === 'customers');
    console.log('📦 Tabla customers existe:', customerTableExists);
    
    if (!customerTableExists) {
      return res.status(500).json({ 
        error: 'Tabla no existe',
        details: 'La tabla customers no fue encontrada en la base de datos'
      });
    }
    
    // 4. Intentar consulta directa SQL primero
    console.log('🔍 Probando consulta SQL directa...');
    const [rawResults] = await sequelize.query('SELECT COUNT(*) as count FROM customers');
    console.log('📊 Registros en tabla (RAW):', rawResults[0].count);
    
    // 5. Intentar findAll de Sequelize
    console.log('🔍 Probando Customer.findAll()...');
    const customers = await Customer.findAll();
    console.log(`✅ ${customers.length} clientes encontrados con Sequelize`);
    
    res.json(customers);

  } catch (error) {
    console.error('❌ ERROR COMPLETO:');
    console.error('Mensaje:', error.message);
    console.error('Stack:', error.stack);
    console.error('Código:', error.code);
    console.error('Errno:', error.errno);
    
    res.status(500).json({ 
      error: 'Internal Server Error',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Contacte al administrador'
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