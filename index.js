/*// backend/index.js
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

startServer();*/

// backend/index.js
const express = require('express');
const cors = require('cors');
const { sequelize, connectToMySQL } = require('./db'); // Importamos la conexión corregida

// Importar modelos
const Customer = require('./models/Customer');
const Product = require('./models/Product');
const Supplier = require('./models/Supplier');
const { Invoice, Productsale } = require('./models/Report');

// Inicializar Express
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Middleware de logging para debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Rutas
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/sales', require('./routes/sales'));

// Ruta de salud para verificar que el servidor está vivo
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({ 
    message: 'API de Sistema de Facturación',
    version: '1.0.0',
    endpoints: {
      products: '/api/products',
      customers: '/api/customers',
      suppliers: '/api/suppliers',
      reports: '/api/reports',
      health: '/health'
    }
  });
});

// Manejo de errores global
app.use((error, req, res, next) => {
  console.error('Error no manejado:', error);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : error.message
  });
});

// Ruta 404
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// Puerto dinámico para Railway
const PORT = process.env.PORT || 5001;

// Iniciar servidor
const startServer = async () => {
  try {
    // Conectar a la base de datos (usando la función corregida de db.js)
    await connectToMySQL();
    console.log('✅ Conexión a MySQL exitosa');

    // ⚠️ ¡IMPORTANTE! Desactiva la sincronización automática
    // En su lugar, usa solo authenticate() y maneja las tablas manualmente
    // await sequelize.sync({ force: true }); // ¡BORRA TODOS LOS DATOS!
    // await sequelize.sync({ alter: true }); // ¡MODIFICA ESTRUCTURA!
    
    console.log('✅ Base de datos conectada (sin sincronización automática)');

    // Verificar manualmente las tablas importantes
    try {
      const [tables] = await sequelize.query('SHOW TABLES');
      console.log('📊 Tablas existentes en la BD:', tables.map(t => t.Tables_in_pos_db));
    } catch (queryError) {
      console.log('ℹ️ No se pudieron listar las tablas (puede ser normal)');
    }

    // Iniciar servidor
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`🏥 Health check: http://localhost:${PORT}/health`);
      console.log('💡 NOTA: Las tablas no se sincronizan automáticamente');
    });

  } catch (error) {
    console.error('❌ Error iniciando el servidor:', error);
    process.exit(1); // Salir con error
  }
};

// Manejo de cierre graceful
process.on('SIGINT', async () => {
  console.log('🛑 Cerrando servidor...');
  await sequelize.close();
  process.exit(0);
});

startServer();