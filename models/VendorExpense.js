
// models/VendorExpense.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const VendorExpense = sequelize.define('VendorExpense', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  vendedor_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'vendedores', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL'
  },
  categoria: { type: DataTypes.STRING, allowNull: true },   // desayuno, almuerzo, etc.
  monto: { type: DataTypes.DECIMAL(12,2), allowNull: true },
  descripcion: { type: DataTypes.TEXT, allowNull: true },
  fecha: { type: DataTypes.DATEONLY, allowNull: true },
  hora: { type: DataTypes.STRING, allowNull: true },        // HH:mm opcional
  comprobante_url: { type: DataTypes.STRING, allowNull: true },
}, {
  tableName: 'vendor_expenses',
  timestamps: true,
});

module.exports = VendorExpense;
