const VisitaProgramada = require('./VisitaProgramada');
const ResultadoVisita  = require('./ResultadoVisita');
const Vendedor         = require('./Vendedor');
const Customer         = require('./Customer');

// 👇 nuevos modelos para ventas
const Invoice          = require('./Invoice');       // PK: invoice_number
const ProductSale      = require('./ProductSale');   // tabla: productsales
let Product;
try {
  Product = require('./Product');                    // ajusta si tu archivo se llama Products/Producto
} catch (_) {
  try { Product = require('./Products'); } catch(_) {
    try { Product = require('./Producto'); } catch(_) { Product = null; }
  }
}

function defineAssociations() {
  // ————————————————————————————————————————————————————————————————
  // Visitas programadas
  // ————————————————————————————————————————————————————————————————
  VisitaProgramada.hasOne(ResultadoVisita, {
    foreignKey: 'visita_id',
    as: 'resultado',
  });

  // ⚠️ Para evitar el error de alias duplicado, usa un alias distinto a 'visita'
  ResultadoVisita.belongsTo(VisitaProgramada, {
    foreignKey: 'visita_id',
    as: 'visita_programada', // <-- antes 'visita'
  });

  VisitaProgramada.belongsTo(Vendedor, {
    foreignKey: 'vendedor_id',
    as: 'vendedor',
  });

  VisitaProgramada.belongsTo(Customer, {
    foreignKey: 'customer_id',
    as: 'cliente',
  });

  Vendedor.hasMany(VisitaProgramada, {
    foreignKey: 'vendedor_id',
    as: 'visitas',
  });

  Customer.hasMany(VisitaProgramada, {
    foreignKey: 'customer_id',
    as: 'visitas',
  });

  // Relación Vendedor ↔ Customer
  Vendedor.hasMany(Customer, {
    foreignKey: 'vendedor_id',
    as: 'clientes',
  });

  Customer.belongsTo(Vendedor, {
    foreignKey: 'vendedor_id',
    as: 'vendedor',
  });

  // ————————————————————————————————————————————————————————————————
  // Ventas (facturas + items)
  // ————————————————————————————————————————————————————————————————
  if (ProductSale && Invoice) {
    // Invoice ↔ ProductSale (clave no-Id: invoice_number)
    Invoice.hasMany(ProductSale, {
      foreignKey: 'invoice_number',
      sourceKey: 'invoice_number',
      as: 'items',
      constraints: false, // no exige FK físico en la DB
    });

    ProductSale.belongsTo(Invoice, {
      foreignKey: 'invoice_number',
      targetKey: 'invoice_number',
      as: 'invoice',
      constraints: false,
    });
  }

  if (ProductSale && Product) {
    // Product ↔ ProductSale (para ver ventas por producto)
    Product.hasMany(ProductSale, {
      foreignKey: 'product_id',
      as: 'product_sales',
    });

    ProductSale.belongsTo(Product, {
      foreignKey: 'product_id',
      as: 'product',
    });
  }

  console.log('✅ Asociaciones definidas correctamente');
}

module.exports = defineAssociations;
