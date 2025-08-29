const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');
const Vendedor = require('./Vendedor');

const RutaDiaria = sequelize.define('RutaDiaria', {
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
  fecha: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  clientes_planificados: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  clientes_visitados: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  kilometros_recorridos: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0
  },
  gastos: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'rutas_diarias',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['vendedor_id', 'fecha']
    }
  ]
});

// Relaciones
RutaDiaria.belongsTo(Vendedor, { foreignKey: 'vendedor_id', as: 'vendedor' });

module.exports = RutaDiaria;