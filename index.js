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




/*const express = require('express');
const cors = require('cors');
const { sequelize, connectToMySQL } = require('./db'); // Importamos la conexión corregida

// Importar modelos
const Customer = require('./models/Customer');
const Product = require('./models/Product');
const Supplier = require('./models/Supplier');
const { Invoice, Productsale } = require('./models/Report');
const { User } = require('./models/User');
const defineAssociations = require('./models/associations');


// Importar las nuevas rutas
const vendedoresRoutes = require('./routes/vendedores');
const visitasRoutes = require('./routes/visitas');


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
app.use('/api/auth', require('./routes/auth'));
// Agregar las nuevas rutas de vendedores y visitas
app.use('/api/vendedores', vendedoresRoutes);
app.use('/api/visitas', visitasRoutes);


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

startServer();*/




/*const express = require('express');
const cors = require('cors');
const { sequelize, connectToMySQL } = require('./db'); // Importamos la conexión corregida

// Importar modelos
const Customer = require('./models/Customer');
const Product = require('./models/Product');
const Supplier = require('./models/Supplier');
const { Invoice, Productsale } = require('./models/Report');
const { User } = require('./models/User');

// Importar los nuevos modelos
const Vendedor = require('./models/Vendedor');
const VisitaProgramada = require('./models/VisitaProgramada');
const ResultadoVisita = require('./models/ResultadoVisita');

// Importar las nuevas rutas
const vendedoresRoutes = require('./routes/vendedores');
const visitasRoutes = require('./routes/visitas');

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

// Función para definir asociaciones
// En tu index.js, modifica la función defineAssociations:
const defineAssociations = () => {
  try {
    console.log('🔗 Definiendo asociaciones entre modelos...');
    
    // 1. Asociaciones para VisitaProgramada
    VisitaProgramada.hasOne(ResultadoVisita, {
      foreignKey: 'visita_id',
      as: 'resultado'
    });

    ResultadoVisita.belongsTo(VisitaProgramada, {
      foreignKey: 'visita_id',
      as: 'visita'
    });

    VisitaProgramada.belongsTo(Vendedor, {
      foreignKey: 'vendedor_id',
      as: 'vendedor'
    });

    VisitaProgramada.belongsTo(Customer, {
      foreignKey: 'customer_id',
      as: 'cliente'
    });

    // 2. Asociaciones para Vendedor
    Vendedor.hasMany(VisitaProgramada, {
      foreignKey: 'vendedor_id',
      as: 'visitas'
    });

    Vendedor.hasMany(Customer, {
      foreignKey: 'vendedor_id',
      as: 'clientes'
    });

    // 3. Asociaciones para Customer
    Customer.hasMany(VisitaProgramada, {
      foreignKey: 'customer_id',
      as: 'visitas'
    });

    Customer.belongsTo(Vendedor, {
      foreignKey: 'vendedor_id',
      as: 'vendedor'
    });

    console.log('✅ Asociaciones definidas correctamente');
  } catch (error) {
    console.error('❌ Error definiendo asociaciones:', error);
  }
};

// Rutas
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sync', require('./routes/sync'));


// Agregar las nuevas rutas de vendedores y visitas
app.use('/api/vendedores', vendedoresRoutes);
app.use('/api/visitas', visitasRoutes);

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
      vendedores: '/api/vendedores',
      visitas: '/api/visitas',
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

    // Definir asociaciones entre modelos
    defineAssociations();

    // ⚠️ ¡IMPORTANTE! Desactiva la sincronización automática
    // En su lugar, usa solo authenticate() y maneja las tablas manualmente
    // await sequelize.sync({ force: true }); // ¡BORRA TODOS LOS DATOS!
    // await sequelize.sync({ alter: true }); // ¡MODIFICA ESTRUCTURA!
    
    console.log('✅ Base de datos conectada (sin sincronización automática)');

    // Verificar manualmente las tablas importantes
    try {
      const [tables] = await sequelize.query('SHOW TABLES');
      console.log('📊 Tablas existentes en la BD:', tables.map(t => Object.values(t)[0]));
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
  try {
    await sequelize.close();
    console.log('✅ Conexión a la base de datos cerrada');
  } catch (error) {
    console.error('❌ Error cerrando conexión:', error);
  }
  process.exit(0);
});

// Iniciar la aplicación
startServer();*/


// index.js (completo y listo para Railway)

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const { sequelize, connectToMySQL } = require('./db');

// Modelos
const Customer = require('./models/Customer');
const Product = require('./models/Product');
const Supplier = require('./models/Supplier');
const { Invoice, Productsale } = require('./models/Report');
const { User } = require('./models/User');

const Vendedor = require('./models/Vendedor');
const VisitaProgramada = require('./models/VisitaProgramada');
const ResultadoVisita = require('./models/ResultadoVisita');

// Rutas existentes
const vendedoresRoutes = require('./routes/vendedores');
const visitasRoutes = require('./routes/visitas');

const app = express();

// ====== Middlewares base ======
app.use(cors());
app.use(express.json());

// Logging simple
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ====== Volumen Railway: /imagenes + subcarpeta /uploads ======
const IMAGES_ROOT = '/imagenes';                  // tu Disk en Railway
const UPLOADS_DIR = path.join(IMAGES_ROOT, 'uploads');

// Crea /imagenes y /imagenes/uploads si no existen
try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log('📁 Carpeta de uploads OK:', UPLOADS_DIR);
} catch (err) {
  console.error('❌ Error creando carpeta uploads:', err.message);
}

// Servir archivos subidos (público)
app.use('/uploads', express.static(UPLOADS_DIR));

// ====== Multer (subida de audios) ======
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || '.mp3').toLowerCase() || '.mp3';
    const base = path.basename(file.originalname || 'audio', ext).replace(/[^\w\-]+/g, '_');
    cb(null, `${base}-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
  },
});

// ====== Asociaciones ======
const defineAssociations = () => {
  try {
    console.log('🔗 Definiendo asociaciones entre modelos...');

    // VisitaProgramada ↔ ResultadoVisita
    VisitaProgramada.hasOne(ResultadoVisita, {
      foreignKey: 'visita_id',
      as: 'resultado'
    });
    ResultadoVisita.belongsTo(VisitaProgramada, {
      foreignKey: 'visita_id',
      as: 'visita'
    });

    // VisitaProgramada → Vendedor / Cliente
    VisitaProgramada.belongsTo(Vendedor, {
      foreignKey: 'vendedor_id',
      as: 'vendedor'
    });
    VisitaProgramada.belongsTo(Customer, {
      foreignKey: 'customer_id',
      as: 'cliente'
    });

    // Vendedor → Visitas / Clientes
    Vendedor.hasMany(VisitaProgramada, { foreignKey: 'vendedor_id', as: 'visitas' });
    Vendedor.hasMany(Customer, { foreignKey: 'vendedor_id', as: 'clientes' });

    // Cliente → Visitas / Vendedor
    Customer.hasMany(VisitaProgramada, { foreignKey: 'customer_id', as: 'visitas' });
    Customer.belongsTo(Vendedor, { foreignKey: 'vendedor_id', as: 'vendedor' });

    console.log('✅ Asociaciones definidas correctamente');
  } catch (error) {
    console.error('❌ Error definiendo asociaciones:', error);
  }
};

// ====== Rutas de tu API ======
app.use('/api/vendor-expenses', require('./routes/vendorExpenses'));
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/config', require('./routes/config'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/sync', require('./routes/sync'));
app.use('/api/vendedores', vendedoresRoutes);
app.use('/api/visitas', visitasRoutes);



// ====== Endpoint AI: Transcribir audio ======
/*
  - Subir audio (campo "audio") a /imagenes/uploads
  - Si OPENAI_API_KEY existe -> transcribe con Whisper y devuelve texto
  - Si no -> devuelve solo la URL pública del archivo
*/
app.post('/api/ai/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No se envió archivo "audio"' });
    }

    const publicUrl = `/uploads/${req.file.filename}`;

    // ¿Tenemos API key para transcribir?
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(201).json({
        ok: true,
        file: req.file.filename,
        url: publicUrl,
        message: 'Archivo subido. Define OPENAI_API_KEY para habilitar la transcripción.'
      });
    }

    // Transcripción con OpenAI (Whisper)
    let text = '';
    try {
      const OpenAI = require('openai');
      const client = new OpenAI({ apiKey });

      const resp = await client.audio.transcriptions.create({
        file: fs.createReadStream(req.file.path),
        model: 'whisper-1',     // o 'gpt-4o-transcribe' si tu cuenta lo soporta
        language: 'es'          // forzar español (opcional)
      });

      text = resp?.text || '';
    } catch (e) {
      console.warn('[AI][transcribe] fallo transcripción:', e?.message);
      // devolvemos igual la URL del archivo
      return res.status(201).json({
        ok: true,
        file: req.file.filename,
        url: publicUrl,
        transcribed: false,
        error: 'No se pudo transcribir, pero el audio fue subido.',
      });
    }

    return res.status(201).json({
      ok: true,
      file: req.file.filename,
      url: publicUrl,
      transcribed: true,
      text,
    });
  } catch (err) {
    console.error('[AI][transcribe] error:', err);
    res.status(500).json({ ok: false, error: 'Error procesando el audio' });
  }
});

// (Opcional) Listar archivos subidos
app.get('/api/uploads/list', async (req, res) => {
  try {
    const files = fs.readdirSync(UPLOADS_DIR)
      .filter(f => !f.startsWith('.'))
      .map(f => ({
        file: f,
        url: `/uploads/${f}`,
        mtime: fs.statSync(path.join(UPLOADS_DIR, f)).mtime,
        size: fs.statSync(path.join(UPLOADS_DIR, f)).size,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    res.json({ ok: true, count: files.length, files });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Salud
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Raíz
app.get('/', (req, res) => {
  res.json({
    message: 'API de Sistema de Facturación',
    version: '1.0.0',
    endpoints: {
      products: '/api/products',
      customers: '/api/customers',
      suppliers: '/api/suppliers',
      reports: '/api/reports',
      sales: '/api/sales',
      auth: '/api/auth',
      sync: '/api/sync',
      vendedores: '/api/vendedores',
      visitas: '/api/visitas',
      uploads_list: '/api/uploads/list',
      ai_transcribe: '/api/ai/transcribe',
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

// 404
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// ====== Inicio ======
const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    await connectToMySQL();
    console.log('✅ Conexión a MySQL exitosa');

    defineAssociations();

    // NO sincronizamos automáticamente
    // await sequelize.sync({ alter: true });

    try {
      const [tables] = await sequelize.query('SHOW TABLES');
      console.log('📊 Tablas existentes:', tables.map(t => Object.values(t)[0]));
    } catch {
      console.log('ℹ️ No se pudieron listar las tablas (puede ser normal)');
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`🏥 Health: http://localhost:${PORT}/health`);
      console.log(`📂 Uploads públicos: /uploads/*  (FS: ${UPLOADS_DIR})`);
    });
  } catch (error) {
    console.error('❌ Error iniciando el servidor:', error);
    process.exit(1);
  }
};

// Cierre graceful
process.on('SIGINT', async () => {
  console.log('🛑 Cerrando servidor...');
  try {
    await sequelize.close();
    console.log('✅ Conexión a la base de datos cerrada');
  } catch (error) {
    console.error('❌ Error cerrando conexión:', error);
  }
  process.exit(0);
});

startServer();
