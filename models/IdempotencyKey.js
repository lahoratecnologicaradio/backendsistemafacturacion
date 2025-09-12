// models/IdempotencyKey.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const IdempotencyKey = sequelize.define('IdempotencyKey', {
  key: {
    type: DataTypes.STRING(191),
    allowNull: false,
    unique: true,
  },
  type: {
    type: DataTypes.ENUM('order', 'visit'),
    allowNull: false,
  },
  server_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'idempotency_keys',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = IdempotencyKey;
