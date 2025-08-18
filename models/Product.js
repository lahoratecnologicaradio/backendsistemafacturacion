// models/Product.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  product_name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'El nombre del producto es requerido'
      }
    }
  },
  brand_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  supplier_name: {
    type: DataTypes.STRING
  },
  o_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: {
        args: [0],
        msg: 'El precio de compra no puede ser negativo'
      }
    }
  },
  s_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: {
        args: [0],
        msg: 'El precio de venta no puede ser negativo'
      }
    }
  },
  qty: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: {
        args: [0],
        msg: 'La cantidad no puede ser negativa'
      }
    }
  },
  rec_date: {
    type: DataTypes.DATEONLY
  },
  exp_date: {
    type: DataTypes.DATEONLY
  },
  barcode: {
    type: DataTypes.STRING,
    unique: true
  },
  category: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'products',
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      unique: true,
      fields: ['product_name', 'brand_name'] // Índice compuesto único
    },
    {
      fields: ['category'] // Índice por categoría (corregido)
    },
    {
      fields: ['barcode'] // Ya que es unique, conviene tenerlo como índice
    }
  ]
});

module.exports = Product;