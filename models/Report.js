const { DataTypes } = require('sequelize');
const { sequelize } = require('../db'); 

// Modelo Invoice
const Invoice = sequelize.define('Invoice', {
    invoice_number: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false
    },
    date_time: {
        type: DataTypes.DATE
    },
    customer_name: {
        type: DataTypes.STRING
    },
    customer_id: {
        type: DataTypes.INTEGER,
        allowNull: true // Puede ser null si no se especifica cliente
    },
    vendedor_id: {
        type: DataTypes.INTEGER,
        allowNull: true // Puede ser null si no se especifica vendedor
    },
    total: {
        type: DataTypes.FLOAT
    },
    cash: {
        type: DataTypes.FLOAT
    },
    change: {
        type: DataTypes.FLOAT
    }
}, {
    tableName: 'invoices',
    timestamps: false
});

// Modelo Productsale
const Productsale = sequelize.define('Productsale', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    invoice_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Invoice,
            key: 'invoice_number'
        }
    },
    product_id: {
        type: DataTypes.STRING
    },
    product_name: {
        type: DataTypes.STRING
    },
    price: {
        type: DataTypes.FLOAT
    },
    qty: {
        type: DataTypes.INTEGER
    },
    discount: {
        type: DataTypes.FLOAT
    },
    amount: {
        type: DataTypes.FLOAT
    }
}, {
    tableName: 'productsales',
    timestamps: false
});

// Relaciones
Invoice.hasMany(Productsale, {
    foreignKey: 'invoice_number'
});
Productsale.belongsTo(Invoice, {
    foreignKey: 'invoice_number'
});

module.exports = { Invoice, Productsale };
