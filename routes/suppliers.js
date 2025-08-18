const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const { Op } = require('sequelize'); // Importar operadores de Sequelize
const Supplier = require('../models/Supplier');

// ROUTE-1: Get All Suppliers - GET "/api/suppliers/fetchallsuppliers"
router.get('/fetchallsuppliers', async (req, res) => {
    try {
        const suppliers = await Supplier.findAll();
        res.json(suppliers);
    } catch (error) {
        console.error('Error fetching suppliers:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            details: process.env.NODE_ENV !== 'production' ? error.message : null
        });
    }
});

// ROUTE-2: Add New Supplier - POST "/api/suppliers/addsupplier"
router.post('/addsupplier', async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { supplier_name, contact_person, address, c_number, note } = req.body;
        
        const supplier = await Supplier.create({
            supplier_name, 
            contact_person, 
            address, 
            c_number, 
            note
        });
        
        res.status(201).json(supplier);
    } catch (error) {
        console.error('Error adding supplier:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            details: process.env.NODE_ENV !== 'production' ? error.message : null
        });
    }
});

// ROUTE-3: Update Supplier - PUT "/api/suppliers/updatesupplier/:id"
router.put('/updatesupplier/:id', async (req, res) => {
    try {
        const { supplier_name, contact_person, address, c_number, note } = req.body;
        
        const supplier = await Supplier.findByPk(req.params.id);
        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        // Actualizar solo los campos proporcionados
        const updatedFields = {};
        if (supplier_name) updatedFields.supplier_name = supplier_name;
        if (contact_person) updatedFields.contact_person = contact_person;
        if (address) updatedFields.address = address;
        if (c_number) updatedFields.c_number = c_number;
        if (note) updatedFields.note = note;

        await supplier.update(updatedFields);
        res.json(supplier);
    } catch (error) {
        console.error('Error updating supplier:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            details: process.env.NODE_ENV !== 'production' ? error.message : null
        });
    }
});

// ROUTE-4: Delete Supplier - DELETE "/api/suppliers/deletesupplier/:id"
router.delete('/deletesupplier/:id', async (req, res) => {
    try {
        const supplier = await Supplier.findByPk(req.params.id);
        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' });
        }

        await supplier.destroy();
        res.json({ success: true, message: 'Supplier deleted successfully' });
    } catch (error) {
        console.error('Error deleting supplier:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            details: process.env.NODE_ENV !== 'production' ? error.message : null
        });
    }
});

// ROUTE-5: Get Supplier by Name - GET "/api/suppliers/getsupplierByName/:name"
router.get('/getsupplierByName/:name', async (req, res) => {
    try {
        const suppliers = await Supplier.findAll({
            where: {
                supplier_name: {
                    [Op.like]: `${req.params.name}%`
                }
            }
        });

        if (!suppliers || suppliers.length === 0) {
            return res.status(404).json({ message: "No suppliers found" });
        }

        res.json(suppliers);
    } catch (error) {
        console.error('Error searching suppliers:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            details: process.env.NODE_ENV !== 'production' ? error.message : null
        });
    }
});

module.exports = router;