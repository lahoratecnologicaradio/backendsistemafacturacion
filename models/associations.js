const VisitaProgramada = require('./VisitaProgramada');
const ResultadoVisita = require('./ResultadoVisita');
const Vendedor = require('./Vendedor');
const Customer = require('./Customer');

// Definir las asociaciones
function defineAssociations() {
  // VisitaProgramada tiene un ResultadoVisita
  VisitaProgramada.hasOne(ResultadoVisita, {
    foreignKey: 'visita_id',
    as: 'resultado'
  });

  // ResultadoVisita pertenece a una VisitaProgramada
  ResultadoVisita.belongsTo(VisitaProgramada, {
    foreignKey: 'visita_id',
    as: 'visita'
  });

  // VisitaProgramada pertenece a un Vendedor
  VisitaProgramada.belongsTo(Vendedor, {
    foreignKey: 'vendedor_id',
    as: 'vendedor'
  });

  // VisitaProgramada pertenece a un Customer
  VisitaProgramada.belongsTo(Customer, {
    foreignKey: 'customer_id',
    as: 'cliente'
  });

  // Vendedor tiene muchas VisitaProgramada
  Vendedor.hasMany(VisitaProgramada, {
    foreignKey: 'vendedor_id',
    as: 'visitas'
  });

  // Customer tiene muchas VisitaProgramada
  Customer.hasMany(VisitaProgramada, {
    foreignKey: 'customer_id',
    as: 'visitas'
  });

  console.log('Asociaciones definidas correctamente');
}

module.exports = defineAssociations;