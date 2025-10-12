'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

// Tabla sugerida: correo_configuracion (id, correo)
// Si tu tabla se llama distinto, ajusta "tableName".
const CorreoConfiguracion = sequelize.define('CorreoConfiguracion', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  correo: { type: DataTypes.STRING(190), allowNull: false }
}, {
  tableName: 'correo_configuracion',
  timestamps: false
});

module.exports = CorreoConfiguracion;
