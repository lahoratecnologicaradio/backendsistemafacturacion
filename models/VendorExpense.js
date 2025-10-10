// models/VendorExpense.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const VendorExpense = sequelize.define('VendorExpense', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  vendedor_id: { type: DataTypes.INTEGER, allowNull: true },
  categoria: { type: DataTypes.STRING(100), allowNull: true },
  monto: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
  descripcion: { type: DataTypes.TEXT, allowNull: true },
  fecha: { type: DataTypes.DATEONLY, allowNull: true },
  hora: { type: DataTypes.TIME, allowNull: true },
  comprobante_url: { type: DataTypes.STRING(255), allowNull: true },
}, {
  tableName: 'vendor_expenses',
  timestamps: true,
  // 👇 mapea los nombres reales de la DB
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  // (opcional) si quieres que Sequelize use snake_case en llaves/auto:
  // underscored: true,
});

module.exports = VendorExpense;

