const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');
const VisitaProgramada = require('./VisitaProgramada');

const ResultadoVisita = sequelize.define('ResultadoVisita', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  visita_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'visitas_programadas',
      key: 'id'
    }
  },
  interes_cliente: {
    type: DataTypes.ENUM('alto', 'medio', 'bajo', 'ninguno'),
    defaultValue: 'medio'
  },
  probabilidad_venta: {
    type: DataTypes.ENUM('alta', 'media', 'baja'),
    defaultValue: 'media'
  },
  productos_interes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Productos que mostró interés'
  },
  pedido_realizado: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  monto_potencial: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  // ✅ NUEVOS CAMPOS A AGREGAR:
  tipo_pago: {
    type: DataTypes.ENUM('contado', 'credito', 'mixto'),
    defaultValue: 'contado',
    comment: 'Tipo de pago realizado en la visita'
  },
  monto_contado: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: 'Monto pagado al contado (efectivo)'
  },
  monto_credito: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: 'Monto a crédito'
  },
  monto_total: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    comment: 'Monto total (contado + crédito)'
  },
  observaciones: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  proxima_visita: {
    type: DataTypes.DATEONLY,
    allowNull: true
  }
}, {
  tableName: 'resultados_visitas',
  timestamps: true,
  underscored: true
});

// Relaciones
ResultadoVisita.belongsTo(VisitaProgramada, { foreignKey: 'visita_id', as: 'visita' });

module.exports = ResultadoVisita;