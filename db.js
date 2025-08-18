const { Sequelize } = require('sequelize');

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

module.exports = { sequelize, connectToMySQL };
