const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize'); 


//ROUTE-1: Get All the Products using: GET "/api/products/fetchallproducts/"
router.get('/fetchallproducts', async (req, res) => {

    try {
        const products = await Product.findAll(); // Método correcto de Sequelize
        res.json(products);
    

    } catch (error) {
        console.error(error.message);
        res.status(500).send("Internal Server Error");
    }
})

//ROUTE-2: Add a new Product using: POST "/api/products/addproduct/"
router.post('/addproduct', async (req, res) => {
    try {
        const { product_name, brand_name, description, supplier_name, o_price, s_price, qty, rec_date, exp_date } = req.body;
        //If error return (Bad request and errors)

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const product = new Product({
            product_name, brand_name, description, supplier_name, o_price, s_price, qty, rec_date, exp_date
        })
        const saveProduct = await product.save()
        res.json(saveProduct)
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Internal Server Error");
    }
})

//ROUTE-3: Update a Product using: PUT "/api/products/updateproduct/:id"
router.put('/updateproduct/:id', async (req, res) => {
    const { product_name, brand_name, description, supplier_name, o_price, s_price, qty, rec_date, exp_date } = req.body;

    try {
        // Find the product to be updated
        let product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        // Create a newProduct object
        const newProduct = {};
        if (product_name) newProduct.product_name = product_name;
        if (brand_name) newProduct.brand_name = brand_name;
        if (supplier_name) newProduct.supplier_name = supplier_name;
        if (description) newProduct.description = description;
        if (o_price) newProduct.o_price = o_price;
        if (s_price) newProduct.s_price = s_price;
        if (qty) newProduct.qty = qty;
        if (rec_date) newProduct.rec_date = rec_date;
        if (exp_date) newProduct.exp_date = exp_date;

        // Update the product
        product = await Product.findByIdAndUpdate(
            req.params.id,
            { $set: newProduct },
            { new: true }
        );

        res.json({ product });

    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
});



//ROUTE-4: Delete a Product using: DELETE "/api/products/deleteproduct/:id"
router.delete('/deleteproduct/:id', async (req, res) => {
    try {
        // Find the Product to be delete and delete it
        //parms.id is a id that are in route.post URL
        let product = await Product.findById(req.params.id);
        if (!product) {
            res.status(404).send("Not Found")
        }

        product = await Product.findByIdAndDelete(req.params.id)
        res.json({ "Success": "Product Deleted", product: product });
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Internal Server Error");
    }
})


// ROUTE-4: Get a Product by its name using: GET "/api/products/getproductByName/:name"
router.get('/getproductByName/:name', async (req, res) => {
    try {
        const searchTerm = req.params.name.trim();
        
        if (!searchTerm || searchTerm.length < 2) {
            return res.status(400).json({ 
                success: false,
                message: "Por favor ingrese al menos 2 caracteres para la búsqueda" 
            });
        }

        const products = await Product.findAll({
            where: {
                product_name: {
                    [Op.like]: `${searchTerm}%`
                }
            },
            limit: 20
        });

        if (products.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: "No se encontraron productos con ese nombre" 
            });
        }

        res.json({
            success: true,
            count: products.length,
            products
        });

    } catch (error) {
        console.error('Error en búsqueda de productos:', error);
        res.status(500).json({ 
            success: false,
            message: "Error interno al buscar productos",
            error: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
});

module.exports = router;