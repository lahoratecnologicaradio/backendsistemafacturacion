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
  },
  vendedor_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'vendedores', // Nombre de la tabla de vendedores
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL'
  }
}, {
  tableName: 'customers',
  timestamps: true,
  underscored: false
});

// Si necesitas definir asociaciones (opcional pero recomendado)
Customer.associate = function(models) {
  Customer.belongsTo(models.Vendedor, {
    foreignKey: 'vendedor_id',
    as: 'vendedor'
  });
};

module.exports = Customer;