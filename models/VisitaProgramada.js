const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');
const Vendedor = require('./Vendedor');
const Customer = require('./Customer'); // Asumiendo que tienes un modelo Customer

const VisitaProgramada = sequelize.define('VisitaProgramada', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  vendedor_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'vendedores',
      key: 'id'
    }
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'customers',
      key: 'id'
    }
  },
  fecha_programada: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  hora_programada: {
    type: DataTypes.TIME,
    allowNull: true
  },
  estado: {
    type: DataTypes.ENUM('pendiente', 'realizada', 'cancelada', 'reprogramada'),
    defaultValue: 'pendiente'
  },
  prioridad: {
    type: DataTypes.ENUM('alta', 'media', 'baja'),
    defaultValue: 'media'
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  fecha_realizacion: {
    type: DataTypes.DATE,
    allowNull: true
  },
  duracion_visita: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Duración en minutos'
  }
}, {
  tableName: 'visitas_programadas',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['fecha_programada', 'vendedor_id']
    },
    {
      fields: ['estado', 'fecha_programada']
    }
  ]
});

// Relaciones
VisitaProgramada.belongsTo(Vendedor, { foreignKey: 'vendedor_id', as: 'vendedor' });
VisitaProgramada.belongsTo(Customer, { foreignKey: 'customer_id', as: 'cliente' });

module.exports = VisitaProgramada;