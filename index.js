// backend/index.js
const express = require('express');
const cors = require('cors');
const { sequelize } = require('./db'); // Importamos Sequelize

// Importar modelos
const Customer = require('./models/Customer');
const Product = require('./models/Product');
const Supplier = require('./models/Supplier');
const { Invoice, Productsale } = require('./models/Report');

// Inicializar Express
const app = express();
const port = 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/reports', require('./routes/reports'));

// Sincronizar modelos y conectar a MySQL
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Conexión a MySQL exitosa');

    // Sincroniza todas las tablas (crea si no existen)
    await sequelize.sync({ alter: true }); 
    console.log('Tablas sincronizadas correctamente');

    // Iniciar servidor
    app.listen(port, () => {
      console.log(`Servidor corriendo en http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Error conectando a MySQL:', error);
  }
};

startServer();
