const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Invoice = sequelize.define('Invoice', {
  invoice_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true // 👈 clave primaria en vez de id si la tabla no tiene 'id'
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
  }
}, {
  tableName: 'invoices', // 👈 apunta a la tabla real
  timestamps: false       // 👈 ponlo en false si la tabla NO tiene createdAt/updatedAt
});

module.exports = Invoice;
