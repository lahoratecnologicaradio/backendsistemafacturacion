// models/Customer.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Customer = sequelize.define('Customer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  full_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  product_name: {
    type: DataTypes.STRING
  },
  address: {
    type: DataTypes.STRING
  },
  c_number: {
    type: DataTypes.BIGINT
  },
  note: {
    type: DataTypes.TEXT
  },
  total: {
    type: DataTypes.DECIMAL(10, 2)
  },
  due_date: {
    type: DataTypes.DATE
  }
  // ⚠️ REMUEVE las definiciones manuales de createdAt y updatedAt
  // Sequelize las maneja automáticamente
}, {
  tableName: 'customers',
  timestamps: true, // Habilita timestamps
  underscored: false, // ⬅️ ¡IMPORTANTE! Cambia a FALSE
  // Especifica los nombres exactos de las columnas:
  createdAt: 'createdAt', // nombre exacto en tu BD
  updatedAt: 'updatedAt'   // nombre exacto en tu BD
});

module.exports = Customer;