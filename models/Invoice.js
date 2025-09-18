// models/Invoice.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Invoice = sequelize.define('Invoice', {
  invoice_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true
  },
  date_time: {
    type: DataTypes.DATE,
    allowNull: false
  },
  customer_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  cash: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  change: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },

  // 🔽 NUEVOS (opcionales) para vendedor y pagos a crédito
  seller_id: {
    type: DataTypes.INTEGER,     // o STRING si lo manejas así
    allowNull: true
  },
  payment_method: {
    type: DataTypes.STRING,      // 'cash' | 'credit'
    allowNull: true,
    defaultValue: 'cash'
  },
  paid_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'invoices',
  timestamps: false
});

module.exports = Invoice;

