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
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: {
        msg: 'El email debe ser válido'
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
  underscored: true
});

// Relaciones
Vendedor.belongsTo(User, { foreignKey: 'user_id', as: 'usuario' });

module.exports = Vendedor;