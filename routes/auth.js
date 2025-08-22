// routes/auth.js
const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const { sequelize } = require('../db');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Middleware para verificar token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// ROUTE-1: Login de usuario
router.post('/login', async (req, res) => {
    console.log('🔍 INICIANDO LOGIN - Request body:', req.body);
    
    const transaction = await sequelize.transaction();
    
    try {
      const { userid, pwd, version } = req.body;
      console.log('📨 Datos recibidos:', { userid, pwd: '***', version });
  
      // Validar campos requeridos
      if (!userid || !pwd) {
        console.log('❌ Faltan campos requeridos');
        await transaction.rollback();
        return res.status(400).json({ 
          success: false,
          error: 'Usuario y contraseña son requeridos' 
        });
      }
  
      // Buscar usuario en la base de datos
      console.log('🔎 Buscando usuario en BD:', userid);
      const user = await User.findOne({
        where: { 
          userid: userid,
          status: 'active'
        },
        transaction
      });
  
      console.log('👤 Usuario encontrado:', user ? 'SÍ' : 'NO');
      if (!user) {
        console.log('❌ Usuario no encontrado o inactivo');
        await transaction.rollback();
        return res.status(401).json({ 
          success: false,
          error: 'Usuario no encontrado o inactivo' 
        });
      }
  
      console.log('🔐 Comparando contraseña...');
      console.log('📝 Contraseña recibida (primeros 5 chars):', pwd.substring(0, 5) + '...');
      console.log('🗃️ Hash almacenado:', user.password);
      
      // Verificar contraseña (asumiendo que está hasheada con bcrypt)
      const isPasswordValid = await bcrypt.compare(pwd, user.password);
      console.log('✅ ¿Contraseña válida?', isPasswordValid);
      
      if (!isPasswordValid) {
        console.log('❌ Contraseña incorrecta');
        await transaction.rollback();
        return res.status(401).json({ 
          success: false,
          error: 'Contraseña incorrecta' 
        });
      }
  
      // Actualizar último login
      console.log('🕐 Actualizando último login...');
      await user.update({ 
        last_login: new Date() 
      }, { transaction });
  
      // Generar token JWT
      console.log('🔨 Generando token JWT...');
      const token = jwt.sign(
        { 
          id: user.id, 
          userid: user.userid,
          name: user.name,
          department: user.department,
          role: user.role 
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
      );
  
      await transaction.commit();
      console.log('✅ LOGIN EXITOSO para usuario:', user.userid);
  
      // Respuesta exitosa (formato que espera tu frontend)
      res.json({
        success: true,
        message: `${user.name}|${user.department}`,
        token: token,
        user: {
          id: user.id,
          userid: user.userid,
          name: user.name,
          department: user.department,
          role: user.role
        }
      });
  
    } catch (error) {
      console.error('💥 ERROR CRÍTICO en login:', error.message);
      console.error('📌 STACK:', error.stack);
      
      if (transaction.finished !== 'commit') {
        await transaction.rollback();
        console.log('🔄 Transacción revertida');
      }
      
      res.status(500).json({ 
        success: false,
        error: 'Error interno del servidor',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      });
    }
  });

// ROUTE-2: Registro de nuevo usuario
router.post('/register', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { userid, password, name, department, role } = req.body;

    // Validar campos requeridos
    if (!userid || !password || !name || !department) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        error: 'Todos los campos son requeridos' 
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({
      where: { userid: userid },
      transaction
    });

    if (existingUser) {
      await transaction.rollback();
      return res.status(409).json({ 
        success: false,
        error: 'El usuario ya existe' 
      });
    }

    // Hash de la contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Crear nuevo usuario
    const newUser = await User.create({
      userid: userid,
      password: hashedPassword,
      name: name,
      department: department,
      role: role || 'user',
      status: 'active'
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      user: {
        id: newUser.id,
        userid: newUser.userid,
        name: newUser.name,
        department: newUser.department,
        role: newUser.role
      }
    });

  } catch (error) {
    if (transaction.finished !== 'commit') {
      await transaction.rollback();
    }
    
    console.error('❌ ERROR en registro:', error.message);
    
    // Manejar error de duplicado
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ 
        success: false,
        error: 'El usuario ya existe' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Error al registrar usuario',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// ROUTE-3: Verificar token (opcional)
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'Usuario no encontrado' 
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        userid: user.userid,
        name: user.name,
        department: user.department,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error al verificar token:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al verificar token' 
    });
  }
});

// ROUTE-4: Obtener todos los usuarios (solo admin)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    // Verificar si es admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false,
        error: 'Acceso denegado. Se requiere rol de administrador' 
      });
    }

    const users = await User.findAll({
      attributes: { exclude: ['password'] },
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      users: users
    });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error al obtener usuarios' 
    });
  }
});

module.exports = router;