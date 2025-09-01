const express = require('express');
const router = express.Router();
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { sequelize } = require('../db');
const { Invoice, Productsale } = require('../models/Report');

// ROUTE-1: Get products by invoice number - GET "/api/reports/fetchproductswithinvoicenumber/:invoice_number"
router.get('/fetchproductswithinvoicenumber/:invoice_number', async (req, res) => {
    try {
        const { invoice_number } = req.params;

        const products = await Productsale.findAll({
            where: { invoice_number }
        });

        res.json(products);
    } catch (error) {
        console.error('Error fetching products:', error);/*tex*/
        res.status(500).json({ 
            error: 'Internal Server Error',
            details: process.env.NODE_ENV !== 'production' ? error.message : null
        });
    }
});

// ROUTE-2: Get sales report within date range - GET "/api/reports/salesreport?from=2024-08-01&to=2024-08-11"
router.get('/salesreport', async (req, res) => {
    try {
        const { from, to } = req.query;

        let whereCondition = {}; // Condición vacía para traer todo

        // Si existen AMBOS parámetros from y to, aplicar filtro por fecha
        if (from && to) {
            const startDate = new Date(from);
            const endDate = new Date(to);

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return res.status(400).json({ error: "Invalid date format" });
            }

            whereCondition = {
                date_time: {
                    [Op.between]: [
                        startDate, // Fecha inicial (ej: 2024-08-01 00:00:00)
                        new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1) // Fecha final + 23:59:59
                    ]
                }
            };
        } 
        // Si solo uno de los dos parámetros está presente, es un error
        else if (from || to) {
            return res.status(400).json({ 
                error: "Both 'from' and 'to' parameters are required, or omit both to get all reports" 
            });
        }

        const reports = await Invoice.findAll({
            attributes: [
                'invoice_number', 
                'date_time', 
                'customer_name', 
                'total', 
                'cash', 
                'change'
            ],
            where: whereCondition, // Aplica condición o vacía para traer todo
            order: [['date_time', 'DESC']], // Ordenar por fecha descendente
            raw: true
        });

        res.json(reports);
    } catch (error) {
        console.error('Error fetching sales report:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            details: process.env.NODE_ENV !== 'production' ? error.message : null
        });
    }
});

// ROUTE-3: Add new report - POST "/api/reports/addreport"
router.post('/addreport', async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { invoice_number, customer_name, date_time, products, total, cash, change } = req.body;

        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({ error: "Products should be a non-empty array" });
        }

        // Create invoice within transaction
        const invoice = await Invoice.create({
            invoice_number,
            customer_name,
            date_time,
            total,
            cash,
            change
        }, { transaction });

        // Prepare product data
        const productData = products.map(product => ({
            invoice_number,
            product_name: product.product_name,
            product_id: product.product_id,
            amount: product.t_price,
            qty: product.qty,
            price: product.s_price
        }));

        // Bulk create products within the same transaction
        const productsale = await Productsale.bulkCreate(productData, { transaction });

        // Commit transaction if all operations succeed
        await transaction.commit();

        res.json({ invoice, productsale });
    } catch (error) {
        // Rollback transaction if any error occurs
        await transaction.rollback();
        
        console.error('Error adding report:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            details: process.env.NODE_ENV !== 'production' ? error.message : null
        });
    }
});

module.exports = router;
