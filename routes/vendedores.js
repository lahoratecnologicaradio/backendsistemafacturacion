const express = require('express');
const router = express.Router();
const Vendedor = require('../models/Vendedor');
const { Op } = require('sequelize');

// 1. Endpoint para agregar vendedores
router.post('/add', async (req, res) => {
  try {
    const { user_id, nombre, email, telefono, zona } = req.body;

    // Validar datos requeridos
    if (!nombre || !email) {
      return res.status(400).json({
        success: false,
        message: 'Nombre y email son requeridos'
      });
    }

    // Verificar si el email ya existe
    const existingVendedor = await Vendedor.findOne({ where: { email } });
    if (existingVendedor) {
      return res.status(400).json({
        success: false,
        message: 'El email ya está registrado'
      });
    }

    const vendedor = await Vendedor.create({
      user_id,
      nombre,
      email,
      telefono,
      zona,
      activo: true
    });

    res.status(201).json({
      success: true,
      message: 'Vendedor agregado exitosamente',
      data: vendedor
    });

  } catch (error) {
    console.error('Error al agregar vendedor:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// 2. Endpoint para ver todos los vendedores
router.get('/all', async (req, res) => {
  try {
    const vendedores = await Vendedor.findAll({
      where: { activo: true },
      order: [['nombre', 'ASC']]
    });

    res.json({
      success: true,
      count: vendedores.length,
      data: vendedores
    });

  } catch (error) {
    console.error('Error al obtener vendedores:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// 3. Endpoint para buscar vendedor por ID
router.get('/:id', async (req, res) => {
  try {
    const vendedor = await Vendedor.findByPk(req.params.id);

    if (!vendedor) {
      return res.status(404).json({
        success: false,
        message: 'Vendedor no encontrado'
      });
    }

    res.json({
      success: true,
      data: vendedor
    });

  } catch (error) {
    console.error('Error al obtener vendedor:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// 4. Endpoint para buscar vendedor por nombre
router.get('/search/:nombre', async (req, res) => {
  try {
    const nombre = req.params.nombre.trim();
    
    if (!nombre || nombre.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Por favor ingrese al menos 2 caracteres para la búsqueda'
      });
    }

    const vendedores = await Vendedor.findAll({
      where: {
        nombre: {
          [Op.like]: `%${nombre}%`
        },
        activo: true
      },
      limit: 20,
      order: [['nombre', 'ASC']]
    });

    res.json({
      success: true,
      count: vendedores.length,
      data: vendedores
    });

  } catch (error) {
    console.error('Error al buscar vendedores:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// 5. Endpoint para actualizar vendedor
router.put('/update/:id', async (req, res) => {
  try {
    const vendedor = await Vendedor.findByPk(req.params.id);

    if (!vendedor) {
      return res.status(404).json({
        success: false,
        message: 'Vendedor no encontrado'
      });
    }

    const { nombre, telefono, zona, activo } = req.body;

    // Verificar si el telefono ya existe (excluyendo el actual)
    if (telefono && telefono !== vendedor.email) {
      const existingVendedor = await Vendedor.findOne({ where: { telefono } });
      if (existingVendedor) {
        return res.status(400).json({
          success: false,
          message: 'El telefono ya está registrado por otro vendedor'
        });
      }
    }

    await vendedor.update({
      nombre: nombre || vendedor.nombre,
      telefono: telefono !== undefined ? telefono : vendedor.telefono,
      zona: zona !== undefined ? zona : vendedor.zona,
      activo: activo !== undefined ? activo : vendedor.activo
    });

    res.json({
      success: true,
      message: 'Vendedor actualizado exitosamente',
      data: vendedor
    });

  } catch (error) {
    console.error('Error al actualizar vendedor:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// 6. Endpoint para buscar vendedor por user_id
router.get('/user/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'user_id es requerido'
      });
    }

    const vendedor = await Vendedor.findOne({
      where: { 
        user_id: user_id,
        activo: true 
      }
    });

    if (!vendedor) {
      return res.status(404).json({
        success: false,
        message: 'Vendedor no encontrado para este user_id'
      });
    }

    res.json({
      success: true,
      data: vendedor
    });

  } catch (error) {
    console.error('Error al buscar vendedor por user_id:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

module.exports = router;
