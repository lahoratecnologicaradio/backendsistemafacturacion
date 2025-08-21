/*const databaseUrl = 'mysql://root:MbRUwDvixSbsoRicbzfwcqbDNcjhbDzm@shortline.proxy.rlwy.net:52910/railway';

// Configuración de conexión a MySQL para producción
const sequelize = new Sequelize(databaseUrl, {
    dialect: 'mysql',
    logging: console.log,
    dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' ? {
            require: true,
            rejectUnauthorized: false
        } : false
    },
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    retry: {
        max: 3,
        timeout: 60000
    }
});

// Función para conectar
const connectToMySQL = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexión a MySQL exitosa');
        
        // Sincronizar modelos (opcional, cuidado en producción)
        if (process.env.NODE_ENV !== 'production') {
            await sequelize.sync({ force: false });
            console.log('✅ Modelos sincronizados');
        }
    } catch (error) {
        console.error('❌ Error al conectar a MySQL:', error.message);
        process.exit(1); // Salir si no puede conectar
    }
};

module.exports = { sequelize, connectToMySQL };*/
const { Sequelize } = require('sequelize');
require('dotenv').config(); // ✅ Importar variables de entorno

// Obtener la URL de la base de datos desde variables de entorno
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error('❌ DATABASE_URL no está definida en las variables de entorno');
    process.exit(1);
}

// Configuración de conexión a MySQL para producción
const sequelize = new Sequelize(databaseUrl, {
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false, // Solo log en desarrollo
    dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' ? {
            require: true,
            rejectUnauthorized: false
        } : false
    },
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    retry: {
        max: 3,
        timeout: 60000
    }
});

// Función para conectar
const connectToMySQL = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexión a MySQL exitosa');
        
        // Sincronizar modelos (opcional, cuidado en producción)
        if (process.env.NODE_ENV === 'development') {
            await sequelize.sync({ force: false });
            console.log('✅ Modelos sincronizados');
        }
    } catch (error) {
        console.error('❌ Error al conectar a MySQL:', error.message);
        process.exit(1);
    }
};

module.exports = { sequelize, connectToMySQL };
