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
  // NUEVO CAMPO: IMPUESTO
  tax: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    validate: {
      min: {
        args: [0],
        msg: 'El impuesto no puede ser negativo'
      },
      max: {
        args: [100],
        msg: 'El impuesto no puede ser mayor a 100%'
      }
    },
    comment: 'Porcentaje de impuesto aplicable al producto (ej: 16.00, 21.00)'
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
  // CAMPO: UNIDAD DE MEDIDA
  unit_of_measure: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'unidad',
    validate: {
      notEmpty: {
        msg: 'La unidad de medida es requerida'
      },
      isIn: {
        args: [['unidad', 'libra', 'kilo', 'gramo', 'porción', 'paquete', 'caja', 'litro', 'mililitro', 'metro']],
        msg: 'La unidad de medida no es válida'
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
  },
  // CAMPO PARA LA IMAGEN
  image: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isUrl: {
        msg: 'La imagen debe ser una URL válida'
      }
    }
  }
}, {
  tableName: 'products',
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      unique: true,
      fields: ['product_name', 'brand_name']
    },
    {
      fields: ['category']
    },
    {
      fields: ['barcode']
    },
    // Índice para búsquedas por imagen
    {
      fields: ['image']
    },
    // Índice para búsquedas por unidad de medida
    {
      fields: ['unit_of_measure']
    },
    // NUEVO ÍNDICE: Para búsquedas por rango de impuestos
    {
      fields: ['tax']
    }
  ],
  comment: 'Tabla de productos con información de inventario e impuestos'
});

module.exports = Product;