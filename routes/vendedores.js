// routes/vendedores.js
const express = require('express');
const router = express.Router();
const Vendedor = require('../models/Vendedor');
const { Op } = require('sequelize');

// 1) Crear vendedor (sin email)
router.post('/add', async (req, res) => {
  try {
    const { user_id, nombre, telefono, zona, activo } = req.body;

    // Validación mínima
    if (!nombre) {
      return res.status(400).json({
        success: false,
        message: 'El nombre es requerido'
      });
    }

    // Si quieres garantizar unicidad por teléfono (opcional):
    if (telefono) {
      const dup = await Vendedor.findOne({ where: { telefono } });
      if (dup) {
        return res.status(400).json({
          success: false,
          message: 'El teléfono ya está registrado'
        });
      }
    }

    const vendedor = await Vendedor.create({
      user_id,
      nombre,
      telefono: telefono || null,
      zona: zona || null,
      activo: typeof activo === 'boolean' ? activo : true
    });

    return res.status(201).json({
      success: true,
      message: 'Vendedor agregado exitosamente',
      data: vendedor
    });

  } catch (error) {
    console.error('Error al agregar vendedor:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// 2) Listar activos
router.get('/all', async (req, res) => {
  try {
    const vendedores = await Vendedor.findAll({
      where: { activo: true },
      order: [['nombre', 'ASC']]
    });

    return res.json({
      success: true,
      count: vendedores.length,
      data: vendedores
    });
  } catch (error) {
    console.error('Error al obtener vendedores:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// 3) Por ID
router.get('/:id', async (req, res) => {
  try {
    const vendedor = await Vendedor.findByPk(req.params.id);
    if (!vendedor) {
      return res.status(404).json({ success: false, message: 'Vendedor no encontrado' });
    }
    return res.json({ success: true, data: vendedor });
  } catch (error) {
    console.error('Error al obtener vendedor:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// 4) Buscar por nombre
router.get('/search/:nombre', async (req, res) => {
  try {
    const nombre = req.params.nombre?.trim() || '';
    if (nombre.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Por favor ingrese al menos 2 caracteres para la búsqueda'
      });
    }

    const vendedores = await Vendedor.findAll({
      where: {
        nombre: { [Op.like]: `%${nombre}%` },
        activo: true
      },
      limit: 20,
      order: [['nombre', 'ASC']]
    });

    return res.json({
      success: true,
      count: vendedores.length,
      data: vendedores
    });
  } catch (error) {
    console.error('Error al buscar vendedores:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// 5) Actualizar
router.put('/update/:id', async (req, res) => {
  try {
    const vendedor = await Vendedor.findByPk(req.params.id);
    if (!vendedor) {
      return res.status(404).json({ success: false, message: 'Vendedor no encontrado' });
    }

    const { nombre, telefono, zona, activo } = req.body;

    // Unicidad por teléfono (opcional)
    if (telefono && telefono !== vendedor.telefono) {
      const existing = await Vendedor.findOne({
        where: {
          telefono,
          id: { [Op.ne]: vendedor.id }
        }
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'El teléfono ya está registrado por otro vendedor'
        });
      }
    }

    await vendedor.update({
      nombre: nombre ?? vendedor.nombre,
      telefono: telefono ?? vendedor.telefono,
      zona: zona ?? vendedor.zona,
      activo: typeof activo === 'boolean' ? activo : vendedor.activo
    });

    return res.json({
      success: true,
      message: 'Vendedor actualizado exitosamente',
      data: vendedor
    });
  } catch (error) {
    console.error('Error al actualizar vendedor:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// 6) Buscar por user_id
router.get('/user/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'user_id es requerido' });
    }

    const vendedor = await Vendedor.findOne({
      where: { user_id, activo: true }
    });

    if (!vendedor) {
      return res.status(404).json({ success: false, message: 'Vendedor no encontrado para este user_id' });
    }

    return res.json({ success: true, data: vendedor });
  } catch (error) {
    console.error('Error al buscar vendedor por user_id:', error);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

module.exports = router;
