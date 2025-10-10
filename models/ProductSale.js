
// models/ProductSale.js
'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

// Tabla real: productsales
// Columnas: id, invoice_number, product_id, product_name, price, qty, discount, amount
const ProductSale = sequelize.define('ProductSale', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true
  },
  invoice_number: {
    // Usa BIGINT si tu invoice_number es numérico grande; si lo manejas como string, cámbialo a STRING(32)
    type: DataTypes.BIGINT,
    allowNull: false
  },
  product_id: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true
  },
  product_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: ''
  },
  price: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  qty: {
    type: DataTypes.DECIMAL(12, 2), // si manejas cantidades enteras, puedes usar INTEGER.UNSIGNED
    allowNull: false,
    defaultValue: 0
  },
  discount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'productsales',
  timestamps: false,
  freezeTableName: true
});

// (Opcional) índices para acelerar consultas
ProductSale.addIndex?.({ fields: ['invoice_number'] });
ProductSale.addIndex?.({ fields: ['product_id'] });

module.exports = ProductSale;
