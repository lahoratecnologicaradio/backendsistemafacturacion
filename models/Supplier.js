const { DataTypes } = require('sequelize');
const { sequelize } = require('../db'); 


const Supplier = sequelize.define('Supplier', {
    supplier_name: {
        type: DataTypes.STRING
    },
    contact_person: {
        type: DataTypes.STRING
    },
    address: {
        type: DataTypes.STRING
    },
    c_number: {
        type: DataTypes.BIGINT // Para números grandes de teléfono o contacto
    },
    note: {
        type: DataTypes.TEXT
    }
}, {
    tableName: 'suppliers',
    timestamps: false
});

module.exports = Supplier;
