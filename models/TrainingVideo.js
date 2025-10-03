// models/TrainingVideo.js
'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

// Validador simple para URLs de YouTube (watch?v=..., shorts/ID, embed/ID, youtu.be/ID)
function isValidYouTubeUrl(url) {
  try {
    const u = new URL(String(url));
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (!['youtube.com', 'youtu.be'].includes(host)) return false;

    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return Boolean(id);
    }

    // youtube.com/*
    const path = u.pathname.toLowerCase();
    const v = u.searchParams.get('v');
    if (v) return true;                         // /watch?v=ID
    if (path.startsWith('/shorts/')) return true; // /shorts/ID
    if (path.startsWith('/embed/')) return true;  // /embed/ID
    return false;
  } catch {
    return false;
  }
}

const TrainingVideo = sequelize.define('TrainingVideo', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true
  },

  titulo: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'El título es requerido' },
      len: {
        args: [1, 255],
        msg: 'El título debe tener entre 1 y 255 caracteres'
      }
    }
  },

  url: {
    type: DataTypes.STRING(1024),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'La URL es requerida' },
      isUrl: { msg: 'La URL debe ser válida' },
      esYoutube(value) {
        if (!isValidYouTubeUrl(value)) {
          throw new Error('La URL debe ser de YouTube (watch, shorts, embed o youtu.be)');
        }
      }
    }
  },

  orden: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    validate: {
      min: { args: [0], msg: 'El orden no puede ser negativo' }
    },
    comment: 'Orden de aparición en la lista de capacitación'
  },

  is_active: {
    // Usamos TINYINT(1) explícito porque en las rutas se compara con 1
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1,
    validate: {
      isIn: {
        args: [[0, 1]],
        msg: 'is_active debe ser 0 o 1'
      }
    },
    comment: '1 = activo, 0 = inactivo'
  }
}, {
  tableName: 'training_videos',
  timestamps: true,      // created_at / updated_at (porque usamos underscored)
  underscored: true,     // columnas: created_at, updated_at
  paranoid: false,       // no hay deleted_at en la tabla
  indexes: [
    { fields: ['is_active'] },
    { fields: ['orden'] },
    { unique: true, fields: ['titulo', 'url'] }
  ],
  defaultScope: {
    order: [['orden', 'ASC'], ['id', 'ASC']]
  },
  comment: 'Videos de capacitación (YouTube)'
});

module.exports = TrainingVideo;
