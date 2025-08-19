const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const Customer = require('../models/Customer');

// ROUTE-1: Obtener todos los clientes
router.get('/fetchallcustomers', async (req, res) => {
  try {
    console.log('🔍 Verificando conexión y tabla...');
    
    // 1. Verificar conexión
    await sequelize.authenticate();
    console.log('✅ Conexión a BD exitosa');

    // 2. Verificar acceso directo a la tabla
    const [results] = await sequelize.query('SELECT COUNT(*) as count FROM customers');
    console.log('📊 Registros en tabla customers:', results[0].count);

    // 3. Intentar findAll
    const customers = await Customer.findAll();
    console.log(`✅ Clientes encontrados vía Sequelize: ${customers.length}`);
    
    res.json(customers);
  } catch (error) {
    console.error('❌ Error completo:', error);
    console.error('📌 Stack:', error.stack);
    res.status(500).json({ 
      error: 'Error del servidor',
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