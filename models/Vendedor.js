// models/Vendedor.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');
const User = require('./User'); // Asumiendo que tienes un modelo User

const Vendedor = sequelize.define('Vendedor', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'userid'
    }
  },
  nombre: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'El nombre del vendedor es requerido'
      }
    }
  },
  telefono: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  zona: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'vendedores',
  timestamps: true,
  underscored: true,
  underscored: true
});

// Definir las asociaciones
Vendedor.associate = function(models) {
  // Relación con User
  Vendedor.belongsTo(models.User, { 
    foreignKey: 'user_id', 
    as: 'usuario' 
  });
  
  // Relación con Customer (nueva)
  Vendedor.hasMany(models.Customer, {
    foreignKey: 'vendedor_id',
    as: 'clientes'
  });
};

// Relaciones básicas (para mantener compatibilidad)
Vendedor.belongsTo(User, { 
  foreignKey: 'user_id', 
  as: 'usuario' 
});

module.exports = Vendedor;
