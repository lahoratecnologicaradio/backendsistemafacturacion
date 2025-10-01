const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/* ────────────────────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────────────────────── */
function nullIfEmpty(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
function parseDec(n, def = 0) {
  const v = parseFloat(n);
  return Number.isFinite(v) ? v : def;
}
function parseIntSafe(n, def = 0) {
  const v = parseInt(n, 10);
  return Number.isFinite(v) ? v : def;
}

/* ────────────────────────────────────────────────────────────────────────────
   Multer / almacenamiento
   ──────────────────────────────────────────────────────────────────────────── */
// Carpeta base de imágenes en el filesystem del contenedor
const BASE_IMG_DIR = '/imagenes';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(BASE_IMG_DIR)) {
      fs.mkdirSync(BASE_IMG_DIR, { recursive: true });
    }
    cb(null, BASE_IMG_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, 'product-' + uniqueSuffix + extension);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (JPEG, JPG, PNG, GIF, WEBP)'), false);
  }
});

// Servir estáticos
router.use('/images', express.static(BASE_IMG_DIR));

// Construir URL pública
const generateImageUrl = (req, filename) => {
  return `${req.protocol}://${req.get('host')}/api/products/images/${filename}`;
};

/* ────────────────────────────────────────────────────────────────────────────
   ROUTE-1: Get All the Products
   ──────────────────────────────────────────────────────────────────────────── */
router.get('/fetchallproducts', async (_req, res) => {
  try {
    const products = await Product.findAll({ order: [['createdAt', 'DESC']] });
    res.json(products);
  } catch (error) {
    console.error('fetchallproducts:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

/* ────────────────────────────────────────────────────────────────────────────
   ROUTE-2: Add a new Product with image
   ──────────────────────────────────────────────────────────────────────────── */
router.post('/addproduct', upload.single('image'), async (req, res) => {
  try {
    const {
      product_name,
      brand_name,
      description,
      supplier_name,
      o_price,
      s_price,
      tax,
      qty,
      unit_of_measure,
      rec_date,
      exp_date,
      barcode,
      category
    } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch {} }
      return res.status(400).json({ errors: errors.array() });
    }

    const productData = {
      product_name,
      brand_name,
      description,
      supplier_name,
      o_price: parseDec(o_price),
      s_price: parseDec(s_price),
      tax: parseDec(tax, 0.0),
      qty: parseIntSafe(qty),
      unit_of_measure: (unit_of_measure || 'unidad'),
      rec_date,
      exp_date,
      // 🛡️ clave: tratar vacío como NULL para evitar ER_DUP_ENTRY por índice único
      barcode: nullIfEmpty(barcode),
      category: nullIfEmpty(category)
    };

    if (req.file) {
      productData.image = generateImageUrl(req, req.file.filename);
    }

    const product = await Product.create(productData);

    res.json({
      success: true,
      message: 'Producto agregado exitosamente',
      product
    });
  } catch (error) {
    console.error('Error al agregar producto:', error);

    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (deleteError) {
        console.error('Error al eliminar imagen:', deleteError);
      }
    }

    // Manejo específico de duplicado (ej. UNIQUE barcode)
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Ya existe otro producto con ese código de barras (barcode).',
        detail: error.sqlMessage
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

/* ────────────────────────────────────────────────────────────────────────────
   ROUTE-3: Update a Product
   ──────────────────────────────────────────────────────────────────────────── */
router.put('/updateproduct/:id', upload.single('image'), async (req, res) => {
  try {
    const productId = parseIntSafe(req.params.id, NaN);

    console.log('🔍 ID recibido:', req.params.id, 'Tipo:', typeof req.params.id);
    console.log('🔢 ID parseado:', productId, 'Tipo:', typeof productId);

    let product = Number.isFinite(productId)
      ? await Product.findByPk(productId)
      : null;

    if (!product) {
      console.log('⚠️  No encontrado como número, intentando como string...');
      product = await Product.findByPk(req.params.id);
    }

    if (!product) {
      const allProducts = await Product.findAll({ attributes: ['id', 'product_name'] });
      const availableIds = allProducts.map(p => ({ id: p.id, name: p.product_name }));
      console.log('❌ Producto no encontrado. IDs disponibles:', availableIds);

      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }

      return res.status(404).json({
        success: false,
        message: 'Product not found',
        debug: {
          receivedId: req.params.id,
          parsedId: productId,
          availableProducts: availableIds
        }
      });
    }

    console.log('✅ Producto encontrado:', product.product_name);

    const {
      product_name,
      brand_name,
      description,
      supplier_name,
      o_price,
      s_price,
      tax,
      qty,
      unit_of_measure,
      rec_date,
      exp_date,
      barcode,
      category,
      // opcional: si quieres limpiar barcode explícitamente desde el cliente
      force_clear_barcode
    } = req.body;

    const updateData = {};
    if (product_name !== undefined) updateData.product_name = product_name;
    if (brand_name !== undefined) updateData.brand_name = brand_name;
    if (supplier_name !== undefined) updateData.supplier_name = supplier_name;
    if (description !== undefined) updateData.description = description;
    if (o_price !== undefined) updateData.o_price = parseDec(o_price);
    if (s_price !== undefined) updateData.s_price = parseDec(s_price);
    if (tax !== undefined) updateData.tax = parseDec(tax);
    if (qty !== undefined) updateData.qty = parseIntSafe(qty);
    if (unit_of_measure !== undefined) updateData.unit_of_measure = unit_of_measure;
    if (rec_date !== undefined) updateData.rec_date = rec_date;
    if (exp_date !== undefined) updateData.exp_date = exp_date;

    // 🛡️ barcode/category: '' → NULL
    if (barcode !== undefined) {
      const sanitized = nullIfEmpty(barcode);
      if (sanitized === null && !force_clear_barcode) {
        // Si viene vacío pero NO queremos limpiar, no tocar barcode
      } else {
        updateData.barcode = sanitized; // puede ser string o NULL si force_clear_barcode
      }
    }
    if (category !== undefined) updateData.category = nullIfEmpty(category);

    console.log('📝 Datos a actualizar:', updateData);

    // Imagen nueva
    if (req.file) {
      console.log('🖼️  Imagen recibida:', req.file.filename);
      // Borramos la anterior si existía
      if (product.image) {
        const filename = product.image.split('/').pop();
        const oldImagePath = path.join(BASE_IMG_DIR, filename);
        if (fs.existsSync(oldImagePath)) {
          try {
            fs.unlinkSync(oldImagePath);
            console.log('🗑️  Imagen anterior eliminada:', filename);
          } catch (deleteError) {
            console.error('Error al eliminar imagen anterior:', deleteError);
          }
        }
      }
      updateData.image = generateImageUrl(req, req.file.filename);
    }

    await product.update(updateData);
    console.log('✅ Producto actualizado en la base de datos');

    // Volver a leer el producto (manejar ambos tipos de id)
    let updatedProduct = Number.isFinite(productId)
      ? await Product.findByPk(productId)
      : await Product.findByPk(req.params.id);

    res.json({
      success: true,
      message: 'Producto actualizado exitosamente',
      product: updatedProduct || product
    });

  } catch (error) {
    console.error('❌ Error al actualizar producto:', error);
    console.error('🔍 Stack trace:', error.stack);

    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('🗑️  Imagen temporal eliminada debido al error');
      } catch (deleteError) {
        console.error('Error al eliminar nueva imagen:', deleteError);
      }
    }

    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Ya existe otro producto con ese código de barras (barcode).',
        detail: error.sqlMessage
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: process.env.NODE_ENV === 'development' ? error.message : null,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/* ────────────────────────────────────────────────────────────────────────────
   ROUTE-4: Delete a Product
   ──────────────────────────────────────────────────────────────────────────── */
router.delete('/deleteproduct/:id', async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    if (product.image) {
      const filename = product.image.split('/').pop();
      const imagePath = path.join(BASE_IMG_DIR, filename);
      if (fs.existsSync(imagePath)) {
        try { fs.unlinkSync(imagePath); } catch (deleteError) {
          console.error('Error al eliminar imagen:', deleteError);
        }
      }
    }

    await product.destroy();

    res.json({
      success: true,
      message: 'Producto eliminado exitosamente',
      product
    });
  } catch (error) {
    console.error('deleteproduct:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

/* ────────────────────────────────────────────────────────────────────────────
   ROUTE-5: Get Product by Name
   ──────────────────────────────────────────────────────────────────────────── */
router.get('/getproductByName/:name', async (req, res) => {
  try {
    const searchTerm = (req.params.name || '').trim();

    if (!searchTerm || searchTerm.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Por favor ingrese al menos 2 caracteres para la búsqueda'
      });
    }

    const products = await Product.findAll({
      where: { product_name: { [Op.like]: `${searchTerm}%` } },
      limit: 20,
      order: [['product_name', 'ASC']]
    });

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron productos con ese nombre'
      });
    }

    res.json({ success: true, count: products.length, products });
  } catch (error) {
    console.error('Error en búsqueda de productos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno al buscar productos',
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

/* ────────────────────────────────────────────────────────────────────────────
   Ruta para servir imágenes
   ──────────────────────────────────────────────────────────────────────────── */
router.get('/images/:filename', (req, res) => {
  const filename = req.params.filename;
  const imagePath = path.join(BASE_IMG_DIR, filename);

  if (fs.existsSync(imagePath)) return res.sendFile(imagePath);
  return res.status(404).json({ success: false, message: 'Imagen no encontrada' });
});

module.exports = router;
