// models/Customer.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db'); // Asegúrate de tener tu conexión a Sequelize

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
    type: DataTypes.BIGINT // Usamos BIGINT para números de teléfono largos
  },
  note: {
    type: DataTypes.TEXT // TEXT para notas más largas
  },
  total: {
    type: DataTypes.DECIMAL(10, 2) // DECIMAL para cantidades monetarias
  },
  due_date: {
    type: DataTypes.DATE
  },
  createdAt: { // Sequelize añade esto automáticamente, pero puedes definirlo explícitamente
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'customers', // Nombre exacto de la tabla en MySQL
  timestamps: true, // Habilita createdAt y updatedAt
  underscored: true // Opcional: convierte camelCase a snake_case
});

module.exports = Customer;