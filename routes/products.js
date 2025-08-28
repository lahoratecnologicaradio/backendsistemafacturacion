const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configurar multer para usar el volumen de Railway
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = '/imagenes';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, 'product-' + uniqueSuffix + extension);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (JPEG, JPG, PNG, GIF, WEBP)'), false);
    }
  }
});

// Middleware para servir imágenes estáticas
router.use('/images', express.static('/imagenes'));

// Función para generar la URL completa de la imagen
const generateImageUrl = (req, filename) => {
  return `${req.protocol}://${req.get('host')}/api/products/images/${filename}`;
};

// ROUTE-1: Get All the Products
router.get('/fetchallproducts', async (req, res) => {
  try {
    const products = await Product.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(products);
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Internal Server Error");
  }
});

// ROUTE-2: Add a new Product with image
router.post('/addproduct', upload.single('image'), async (req, res) => {
  try {
    const { 
      product_name, 
      brand_name, 
      description, 
      supplier_name, 
      o_price, 
      s_price, 
      qty, 
      unit_of_measure,  // NUEVO CAMPO
      rec_date, 
      exp_date, 
      barcode, 
      category 
    } = req.body;
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ errors: errors.array() });
    }

    const productData = {
      product_name,
      brand_name,
      description,
      supplier_name,
      o_price: parseFloat(o_price),
      s_price: parseFloat(s_price),
      qty: parseInt(qty),
      unit_of_measure: unit_of_measure || 'unidad',  // NUEVO CAMPO con valor por defecto
      rec_date,
      exp_date,
      barcode,
      category
    };

    if (req.file) {
      productData.image = generateImageUrl(req, req.file.filename);
    }

    const product = await Product.create(productData);
    
    res.json({
      success: true,
      message: 'Producto agregado exitosamente',
      product: product
    });

  } catch (error) {
    console.error('Error al agregar producto:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (deleteError) {
        console.error('Error al eliminar imagen:', deleteError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// ROUTE-3: Update a Product
router.put('/updateproduct/:id', upload.single('image'), async (req, res) => {
  try {
    const { 
      product_name, 
      brand_name, 
      description, 
      supplier_name, 
      o_price, 
      s_price, 
      qty, 
      unit_of_measure,  // NUEVO CAMPO
      rec_date, 
      exp_date, 
      barcode, 
      category 
    } = req.body;

    let product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const updateData = {};
    if (product_name) updateData.product_name = product_name;
    if (brand_name) updateData.brand_name = brand_name;
    if (supplier_name) updateData.supplier_name = supplier_name;
    if (description) updateData.description = description;
    if (o_price) updateData.o_price = parseFloat(o_price);
    if (s_price) updateData.s_price = parseFloat(s_price);
    if (qty) updateData.qty = parseInt(qty);
    if (unit_of_measure) updateData.unit_of_measure = unit_of_measure;  // NUEVO CAMPO
    if (rec_date) updateData.rec_date = rec_date;
    if (exp_date) updateData.exp_date = exp_date;
    if (barcode) updateData.barcode = barcode;
    if (category) updateData.category = category;

    if (req.file) {
      if (product.image) {
        const filename = product.image.split('/').pop();
        const oldImagePath = path.join('/imagenes', filename);
        if (fs.existsSync(oldImagePath)) {
          try {
            fs.unlinkSync(oldImagePath);
          } catch (deleteError) {
            console.error('Error al eliminar imagen anterior:', deleteError);
          }
        }
      }
      
      updateData.image = generateImageUrl(req, req.file.filename);
    }

    await product.update(updateData);

    res.json({
      success: true,
      message: 'Producto actualizado exitosamente',
      product: product
    });

  } catch (error) {
    console.error('Error al actualizar producto:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (deleteError) {
        console.error('Error al eliminar nueva imagen:', deleteError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// ROUTE-4: Delete a Product
router.delete('/deleteproduct/:id', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.image) {
      const filename = product.image.split('/').pop();
      const imagePath = path.join('/imagenes', filename);
      if (fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
        } catch (deleteError) {
          console.error('Error al eliminar imagen:', deleteError);
        }
      }
    }

    await product.destroy();

    res.json({
      success: true,
      message: "Producto eliminado exitosamente",
      product: product
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

// ROUTE-5: Get Product by Name
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
      limit: 20,
      order: [['product_name', 'ASC']]
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

// Ruta para servir imágenes
router.get('/images/:filename', (req, res) => {
  const filename = req.params.filename;
  const imagePath = path.join('/imagenes', filename);
  
  if (fs.existsSync(imagePath)) {
    res.sendFile(imagePath);
  } else {
    res.status(404).json({ 
      success: false,
      message: "Imagen no encontrada" 
    });
  }
});

module.exports = router;