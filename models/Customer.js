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
}, {
  tableName: 'customers',
  timestamps: true,    // Esto es suficiente
  underscored: false   // camelCase por defecto
});

module.exports = Customer;