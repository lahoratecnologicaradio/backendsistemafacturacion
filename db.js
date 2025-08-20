/*const { Sequelize } = require('sequelize');

// Configuración de conexión a MySQL
const sequelize = new Sequelize('pos_db', 'root', 'root', {
    host: 'localhost',
    port: 3306, // cambia al puerto correcto si es distinto
    dialect: 'mysql',
    logging: console.log 
});

// Función para conectar
const connectToMySQL = async () => {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexión a MySQL exitosa');
    } catch (error) {
        console.error('❌ Error al conectar a MySQL:', error);
    }
};

module.exports = { sequelize, connectToMySQL };*/

const { Sequelize } = require('sequelize');

// Obtener la URL de la base de datos desde variables de entorno
const databaseUrl = process.env.DATABASE_URL || 'mysql://root:root@localhost:3306/pos_db';
//const databaseUrl = 'mysql://root:MbRUwDvixSbsoRicbzfwcqbDNcjhbDzm@shortline.proxy.rlwy.net:52910/railway';

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

module.exports = { sequelize, connectToMySQL };
