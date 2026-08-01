const MedicineBatch = require('../models/MedicineBatch');
const MedicineProduct = require('../models/MedicineProduct');
const StockTransaction = require('../models/StockTransaction');
const Sale = require('../models/Sale');
const SaleCounter = require('../models/SaleCounter');
const PrintSetting = require('../models/PrintSetting');
const Patient = require('../models/Patient');
const { getClinicDate } = require('../utils/helpers');

const REQUIRED_HEADERS = [
  'medicine_name',
  'batch_number',
  'expiry_date',
  'pack_unit',
  'loose_unit',
  'units_per_pack',
  'packs_received',
  'loose_received',
  'purchase_price',
  'retail_price',
  'allow_loose_sale',
  'loose_retail_price'
];

function normalizeMedicineName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function packagingSignature(batch) {
  return [
    String(batch.packUnit || 'Pack').trim().toLowerCase(),
    String(batch.looseUnit || 'Unit').trim().toLowerCase(),
    Number(batch.unitsPerPack || 1),
    Boolean(batch.allowLooseSale)
  ].join('|');
}

async function ensureProductCatalog() {
  const batches = await MedicineBatch.find().sort({ createdAt: 1 }).lean();
  const groups = new Map();
  for (const batch of batches) {
    const key = normalizeMedicineName(batch.medicineName);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(batch);
  }

  for (const [normalizedName, productBatches] of groups) {
    const reference = productBatches[0];
    const conflict = new Set(productBatches.map(packagingSignature)).size > 1;
    let product = await MedicineProduct.findOne({ normalizedName });
    if (!product) {
      try {
        product = await MedicineProduct.create({
          name: reference.medicineName,
          normalizedName,
          packUnit: reference.packUnit || 'Pack',
          looseUnit: reference.looseUnit || 'Unit',
          unitsPerPack: reference.unitsPerPack || 1,
          allowLooseSale: Boolean(reference.allowLooseSale),
          packagingStatus: conflict ? 'CONFLICT' : 'ACTIVE'
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
        product = await MedicineProduct.findOne({ normalizedName });
      }
    } else if ((conflict ? 'CONFLICT' : product.packagingStatus) !== product.packagingStatus) {
      product.packagingStatus = 'CONFLICT';
      await product.save();
    }
    await MedicineBatch.updateMany(
      { _id: { $in: productBatches.map((batch) => batch._id) }, product: { $ne: product._id } },
      { $set: { product: product._id } }
    );
  }
}

exports.index = async (req, res, next) => {
  try {
    await ensureProductCatalog();
    const search = String(req.query.search || '').trim();
    const stockStatus = String(req.query.stockStatus || '');
    const expiryStatus = String(req.query.expiryStatus || '');
    const sort = String(req.query.sort || 'medicine');
    const conditions = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const nearExpiryDate = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

    if (search) {
      conditions.push({
        $or: [
            { medicineName: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
            { batchNumber: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
        ]
      });
    }
    if (stockStatus === 'in_stock') conditions.push({ quantity: { $gt: 0 } });
    if (stockStatus === 'out_of_stock') conditions.push({ quantity: { $lte: 0 } });
    if (expiryStatus === 'expired') conditions.push({ expiryDate: { $lt: today } });
    if (expiryStatus === 'near_expiry') conditions.push({ expiryDate: { $gte: today, $lte: nearExpiryDate } });
    if (expiryStatus === 'valid') conditions.push({ expiryDate: { $gt: nearExpiryDate } });

    const query = conditions.length ? { $and: conditions } : {};
    const sortOptions = {
      medicine: { medicineName: 1, expiryDate: 1 },
      expiry: { expiryDate: 1, medicineName: 1 },
      quantity_high: { quantity: -1, medicineName: 1 },
      quantity_low: { quantity: 1, medicineName: 1 },
      retail_high: { retailPrice: -1, medicineName: 1 },
      retail_low: { retailPrice: 1, medicineName: 1 }
    };

    const batches = await MedicineBatch.find(query)
      .sort(sortOptions[sort] || sortOptions.medicine)
      .lean();

    const productDocuments = await MedicineProduct.find({
      _id: { $in: batches.map((batch) => batch.product).filter(Boolean) }
    }).lean();
    const productMap = new Map(productDocuments.map((product) => [String(product._id), product]));
    const grouped = new Map();
    for (const batch of batches) {
      const key = String(batch.product || normalizeMedicineName(batch.medicineName));
      if (!grouped.has(key)) {
        grouped.set(key, { product: productMap.get(String(batch.product)), batches: [], quantity: 0, nextExpiry: null, prices: new Set() });
      }
      const group = grouped.get(key);
      group.batches.push(batch);
      group.quantity += batch.quantity;
      group.prices.add(batch.retailPrice);
      if (!group.nextExpiry || batch.expiryDate < group.nextExpiry) group.nextExpiry = batch.expiryDate;
    }
    const products = [...grouped.values()];

    const summary = batches.reduce((totals, batch) => {
      totals.quantity += batch.quantity;
      totals.stockValue += (batch.quantity / (batch.unitsPerPack || 1)) * batch.purchasePrice;
      if (batch.quantity > 0 && batch.expiryDate < new Date()) totals.expired += 1;
      return totals;
    }, { quantity: 0, stockValue: 0, expired: 0 });

    res.render('inventory/index', {
      title: 'Medicine Inventory',
      products,
      search,
      stockStatus,
      expiryStatus,
      sort,
      summary,
      formatStock: (quantity, product) => {
        const unitsPerPack = product?.unitsPerPack || 1;
        const packs = Math.floor(quantity / unitsPerPack);
        const loose = quantity % unitsPerPack;
        if (unitsPerPack === 1) return `${quantity} ${product?.looseUnit || 'unit'}${quantity === 1 ? '' : 's'}`;
        return `${packs} ${product?.packUnit || 'pack'}${packs === 1 ? '' : 's'} + ${loose} ${product?.looseUnit || 'unit'}${loose === 1 ? '' : 's'}`;
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.productDetails = async (req, res, next) => {
  try {
    await ensureProductCatalog();
    const product = await MedicineProduct.findById(req.params.id).lean();
    if (!product) return res.status(404).render('error', { title: 'Medicine Not Found', pageMessage: 'Medicine product not found.' });
    const batches = await MedicineBatch.find({ product: product._id }).sort({ expiryDate: 1 }).lean();
    const transactions = await StockTransaction.find({ medicineBatch: { $in: batches.map((batch) => batch._id) } })
      .populate('medicineBatch', 'batchNumber expiryDate')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    const totalQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    res.render('inventory/product', { title: product.name, product, batches, transactions, totalQuantity });
  } catch (error) {
    next(error);
  }
};

exports.resolvePackaging = async (req, res, next) => {
  try {
    const product = await MedicineProduct.findById(req.params.id);
    const sourceBatch = await MedicineBatch.findOne({ _id: req.body.batchId, product: req.params.id });
    if (!product || !sourceBatch) return res.redirect(`/inventory?error=${encodeURIComponent('Product or selected batch was not found.')}`);
    const packaging = {
      packUnit: sourceBatch.packUnit || 'Pack',
      looseUnit: sourceBatch.looseUnit || 'Unit',
      unitsPerPack: sourceBatch.unitsPerPack || 1,
      allowLooseSale: Boolean(sourceBatch.allowLooseSale)
    };
    await MedicineBatch.updateMany({ product: product._id }, { $set: packaging });
    Object.assign(product, packaging, { packagingStatus: 'ACTIVE' });
    await product.save();
    return res.redirect(`/inventory/products/${product._id}?message=${encodeURIComponent('Packaging conflict resolved successfully.')}`);
  } catch (error) {
    next(error);
  }
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  row.push(value.trim());
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

exports.showUpload = (req, res) => {
  res.render('inventory/upload', { title: 'Upload Medicines' });
};

exports.showAddStock = (req, res) => {
  res.render('inventory/add', {
    title: 'Add Medicine Stock',
    form: {},
    errors: []
  });
};

exports.addStock = async (req, res, next) => {
  const form = {
    medicineName: String(req.body.medicineName || '').trim(),
    batchNumber: String(req.body.batchNumber || '').trim(),
    expiryDate: String(req.body.expiryDate || '').trim(),
    packsReceived: String(req.body.packsReceived || '0').trim(),
    looseReceived: String(req.body.looseReceived || '0').trim(),
    packUnit: String(req.body.packUnit || 'Box').trim(),
    looseUnit: String(req.body.looseUnit || 'Unit').trim(),
    unitsPerPack: String(req.body.unitsPerPack || '1').trim(),
    allowLooseSale: req.body.allowLooseSale === 'on',
    purchasePrice: String(req.body.purchasePrice || '').trim(),
    retailPrice: String(req.body.retailPrice || '').trim(),
    looseRetailPrice: String(req.body.looseRetailPrice || '0').trim(),
    reference: String(req.body.reference || '').trim()
  };
  const packsReceived = Number(form.packsReceived);
  const looseReceived = Number(form.looseReceived);
  const unitsPerPack = Number(form.unitsPerPack);
  const purchasePrice = Number(form.purchasePrice);
  const retailPrice = Number(form.retailPrice);
  const looseRetailPrice = Number(form.looseRetailPrice);
  const quantity = packsReceived * unitsPerPack + looseReceived;
  const expiryDate = new Date(`${form.expiryDate}T00:00:00.000Z`);
  const errors = [];

  if (!form.medicineName) errors.push('Medicine name is required.');
  if (!form.batchNumber) errors.push('Batch number is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.expiryDate) || Number.isNaN(expiryDate.getTime())) {
    errors.push('Enter a valid expiry date.');
  }
  if (!form.packUnit) errors.push('Pack unit is required.');
  if (!form.looseUnit) errors.push('Loose unit is required.');
  if (!Number.isInteger(unitsPerPack) || unitsPerPack < 1) errors.push('Units per pack must be a whole number of at least 1.');
  if (!Number.isInteger(packsReceived) || packsReceived < 0) errors.push('Packs received must be zero or greater.');
  if (!Number.isInteger(looseReceived) || looseReceived < 0) errors.push('Loose quantity must be zero or greater.');
  if (Number.isFinite(unitsPerPack) && looseReceived >= unitsPerPack) errors.push('Loose quantity must be less than units per pack.');
  if (!Number.isFinite(quantity) || quantity <= 0) errors.push('Enter at least one pack or loose unit.');
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) errors.push('Purchase price must be zero or greater.');
  if (!Number.isFinite(retailPrice) || retailPrice < 0) errors.push('Retail price must be zero or greater.');
  if (form.allowLooseSale && (!Number.isFinite(looseRetailPrice) || looseRetailPrice < 0)) errors.push('Loose retail price must be zero or greater.');

  try {
    const existingProduct = await MedicineProduct.findOne({ normalizedName: normalizeMedicineName(form.medicineName) });
    if (existingProduct?.packagingStatus === 'CONFLICT') {
      errors.push('This medicine has a packaging conflict. Resolve it from the medicine history page before adding stock.');
    } else if (existingProduct) {
      const submittedSignature = packagingSignature({
        packUnit: form.packUnit,
        looseUnit: form.looseUnit,
        unitsPerPack,
        allowLooseSale: form.allowLooseSale
      });
      if (submittedSignature !== packagingSignature(existingProduct)) {
        errors.push(`Packaging must match the product master: 1 ${existingProduct.packUnit} = ${existingProduct.unitsPerPack} ${existingProduct.looseUnit}(s).`);
      }
    }
    if (errors.length) {
      return res.status(422).render('inventory/add', {
        title: 'Add Medicine Stock',
        form,
        errors
      });
    }

    const batch = await MedicineBatch.findOneAndUpdate(
      {
        medicineName: form.medicineName,
        batchNumber: form.batchNumber,
        expiryDate
      },
      {
        $setOnInsert: { product: existingProduct?._id },
        $inc: { quantity },
        $set: {
          purchasePrice,
          retailPrice,
          packUnit: form.packUnit,
          looseUnit: form.looseUnit,
          unitsPerPack,
          allowLooseSale: form.allowLooseSale,
          looseRetailPrice: form.allowLooseSale ? looseRetailPrice : 0
        }
      },
      { upsert: true, new: true, runValidators: true }
    );

    await StockTransaction.create({
      medicineBatch: batch._id,
      type: 'IN',
      quantity,
      reference: form.reference,
      remarks: `${packsReceived} ${form.packUnit}(s) + ${looseReceived} ${form.looseUnit}(s) received`,
      performedBy: req.session?.username || ''
    });

    await ensureProductCatalog();

    return res.redirect(`/inventory?message=${encodeURIComponent(`${form.medicineName} stock added successfully.`)}`);
  } catch (error) {
    return next(error);
  }
};

async function availableMedicines() {
  await ensureProductCatalog();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const products = await MedicineProduct.find({ packagingStatus: 'ACTIVE' }).sort({ name: 1 }).lean();
  const batches = await MedicineBatch.find({
    product: { $in: products.map((product) => product._id) },
    quantity: { $gt: 0 },
    expiryDate: { $gte: today }
  }).sort({ expiryDate: 1 }).lean();
  return products.map((product) => {
    const productBatches = batches.filter((batch) => String(batch.product) === String(product._id));
    const first = productBatches[0];
    return {
      _id: product.name,
      productId: product._id,
      availableQuantity: productBatches.reduce((sum, batch) => sum + batch.quantity, 0),
      retailPrice: first?.retailPrice || 0,
      looseRetailPrice: first?.looseRetailPrice || 0,
      packUnit: product.packUnit,
      looseUnit: product.looseUnit,
      unitsPerPack: product.unitsPerPack,
      allowLooseSale: product.allowLooseSale,
      nextExpiry: first?.expiryDate
    };
  }).filter((product) => product.availableQuantity > 0);
}

async function availablePatients() {
  return Patient.aggregate([
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$mrNumber', patientName: { $first: '$patientName' } } },
    { $sort: { patientName: 1 } },
    { $limit: 500 }
  ]);
}

exports.showSale = async (req, res, next) => {
  try {
    const [medicines, patients] = await Promise.all([availableMedicines(), availablePatients()]);
    res.render('inventory/sale', {
      title: 'New Medicine Sale',
      medicines,
      patients,
      form: { patientMr: '', customerName: '', items: Array.from({ length: 4 }, () => ({})) },
      errors: []
    });
  } catch (error) {
    next(error);
  }
};

exports.salesIndex = async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();
    const status = String(req.query.status || '').trim();
    const soldBy = String(req.query.soldBy || '').trim();
    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const conditions = [];
    if (search) {
      conditions.push({
        $or: [
            { invoiceNumber: { $regex: safeSearch, $options: 'i' } },
            { patientMr: { $regex: safeSearch, $options: 'i' } },
            { customerName: { $regex: safeSearch, $options: 'i' } },
            { 'items.medicineName': { $regex: safeSearch, $options: 'i' } }
        ]
      });
    }
    const validDateFrom = /^\d{4}-\d{2}-\d{2}$/.test(dateFrom);
    const validDateTo = /^\d{4}-\d{2}-\d{2}$/.test(dateTo);
    if (validDateFrom || validDateTo) {
      const createdAt = {};
      if (validDateFrom) createdAt.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
      if (validDateTo) createdAt.$lte = new Date(`${dateTo}T23:59:59.999Z`);
      conditions.push({ createdAt });
    }
    if (status === 'active') conditions.push({ $or: [{ status: 'ACTIVE' }, { status: { $exists: false } }] });
    if (status === 'void') conditions.push({ status: 'VOID' });
    if (soldBy) conditions.push({ performedBy: soldBy });
    const query = conditions.length ? { $and: conditions } : {};

    const [sales, salespeople] = await Promise.all([
      Sale.find(query).sort({ createdAt: -1 }).lean(),
      Sale.distinct('performedBy', { performedBy: { $ne: '' } })
    ]);
    const summary = sales.reduce((totals, sale) => {
      if (sale.status === 'VOID') return totals;
      totals.count += 1;
      totals.amount += sale.grandTotal;
      totals.discount += sale.discountAmount;
      return totals;
    }, { count: 0, amount: 0, discount: 0 });

    res.render('inventory/sales', {
      title: 'Medicine Sales',
      sales,
      search,
      dateFrom,
      dateTo,
      status,
      soldBy,
      salespeople: salespeople.sort(),
      summary
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteSale = async (req, res, next) => {
  try {
    const sale = await Sale.findOneAndUpdate(
      { _id: req.params.id, status: { $ne: 'VOID' } },
      {
        $set: {
          status: 'VOID',
          voidedAt: new Date(),
          voidedBy: req.session?.username || ''
        }
      },
      { new: true }
    );
    if (!sale) {
      return res.redirect(`/inventory/sales?error=${encodeURIComponent('This sale is already deleted.')}`);
    }

    const restored = [];
    const transactionIds = [];
    try {
      for (const item of sale.items) {
        for (const allocation of item.allocations) {
          const update = await MedicineBatch.updateOne(
            { _id: allocation.medicineBatch },
            { $inc: { quantity: allocation.quantity } }
          );
          if (!update.modifiedCount) throw new Error(`Batch ${allocation.batchNumber} could not be restored.`);
          restored.push(allocation);
          const transaction = await StockTransaction.create({
            medicineBatch: allocation.medicineBatch,
            type: 'ADJUSTMENT',
            quantity: allocation.quantity,
            reference: `VOID-${sale.invoiceNumber}`,
            remarks: 'Stock restored from deleted sale',
            performedBy: req.session?.username || ''
          });
          transactionIds.push(transaction._id);
        }
      }

    } catch (error) {
      await Promise.all(restored.map((allocation) =>
        MedicineBatch.updateOne(
          { _id: allocation.medicineBatch },
          { $inc: { quantity: -allocation.quantity } }
        )
      ));
      if (transactionIds.length) {
        await StockTransaction.deleteMany({ _id: { $in: transactionIds } });
      }
      await Sale.updateOne(
        { _id: sale._id },
        { $set: { status: 'ACTIVE', voidedAt: null, voidedBy: '' } }
      );
      throw error;
    }

    return res.redirect(`/inventory/sales?message=${encodeURIComponent(`Sale ${sale.invoiceNumber} deleted and stock restored.`)}`);
  } catch (error) {
    return next(error);
  }
};

exports.saleBill = async (req, res, next) => {
  try {
    if (!require('mongoose').isValidObjectId(req.params.id)) {
      return res.status(404).render('error', {
        title: 'Sale Not Found',
        pageMessage: 'The requested sale could not be found.'
      });
    }

    const [sale, savedPrintSetting] = await Promise.all([
      Sale.findById(req.params.id).lean(),
      PrintSetting.findOne({ key: 'default' }).lean()
    ]);
    if (!sale) {
      return res.status(404).render('error', {
        title: 'Sale Not Found',
        pageMessage: 'The requested sale could not be found.'
      });
    }

    return res.render('inventory/bill', {
      title: `Bill ${sale.invoiceNumber}`,
      sale,
      receiptHeader: savedPrintSetting?.saleHeader || savedPrintSetting?.header || 'My Clinic',
      receiptFooter: savedPrintSetting?.saleFooter || 'Thank you for your purchase.'
    });
  } catch (error) {
    return next(error);
  }
};

function saleItems(body) {
  const rawItems = Array.isArray(body.items)
    ? body.items
    : Object.values(body.items || {});

  return rawItems
    .filter((item) =>
      String(item.medicineName || '').trim() ||
      String(item.packQuantity || '').trim() ||
      String(item.looseQuantity || '').trim()
    )
    .map((item) => ({
      medicineName: String(item.medicineName || '').trim(),
      packQuantity: Number(item.packQuantity || 0),
      looseQuantity: Number(item.looseQuantity || 0),
      discountPercent: Number(item.discountPercent || 0)
    }));
}

async function createInvoiceNumber() {
  const date = getClinicDate();
  let counter;
  try {
    counter = await SaleCounter.findOneAndUpdate(
      { date },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    counter = await SaleCounter.findOneAndUpdate(
      { date },
      { $inc: { sequence: 1 } },
      { new: true }
    );
  }
  return `INV-${date.replaceAll('-', '').slice(2)}-${String(counter.sequence).padStart(3, '0')}`;
}

exports.createSale = async (req, res, next) => {
  const items = saleItems(req.body);
  const form = {
    patientMr: String(req.body.patientMr || '').trim().toUpperCase(),
    customerName: String(req.body.customerName || '').trim(),
    items
  };
  const errors = [];

  if (!items.length) errors.push('Add at least one medicine.');
  for (const [index, item] of items.entries()) {
    if (!item.medicineName) errors.push(`Item ${index + 1}: select a medicine.`);
    if (!Number.isInteger(item.packQuantity) || item.packQuantity < 0 ||
        !Number.isInteger(item.looseQuantity) || item.looseQuantity < 0 ||
        item.packQuantity + item.looseQuantity <= 0) {
      errors.push(`Item ${index + 1}: enter a valid pack or loose quantity.`);
    }
    if (!Number.isFinite(item.discountPercent) ||
        item.discountPercent < 0 ||
        item.discountPercent > 100) {
      errors.push(`Item ${index + 1}: discount must be between 0 and 100.`);
    }
  }

  const duplicateNames = items
    .map((item) => item.medicineName)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length) errors.push('Add each medicine only once per sale.');

  try {
    let linkedPatient = null;
    if (form.patientMr) {
      linkedPatient = await Patient.findOne({ mrNumber: form.patientMr }).sort({ createdAt: -1 }).lean();
      if (!linkedPatient) errors.push('Enter a valid patient MR number, or leave MR blank for a walk-in sale.');
      else form.customerName = linkedPatient.patientName;
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const preparedItems = [];

    if (!errors.length) {
      for (const item of items) {
        const productRecord = await MedicineProduct.findOne({ normalizedName: normalizeMedicineName(item.medicineName) }).lean();
        if (!productRecord || productRecord.packagingStatus !== 'ACTIVE') {
          errors.push(`${item.medicineName}: packaging must be resolved before sale.`);
          continue;
        }
        const batches = await MedicineBatch.find({
          product: productRecord._id,
          quantity: { $gt: 0 },
          expiryDate: { $gte: today }
        }).sort({ expiryDate: 1, createdAt: 1 }).lean();

        const product = batches[0];
        if (!product) {
          errors.push(`${item.medicineName}: no usable stock is available.`);
          continue;
        }
        const unitsPerPack = product.unitsPerPack || 1;
        if (item.looseQuantity > 0 && !product.allowLooseSale) {
          errors.push(`${item.medicineName}: loose sale is not allowed.`);
          continue;
        }
        let remaining = item.packQuantity * unitsPerPack + item.looseQuantity;
        const requiredBaseQuantity = remaining;
        const allocations = [];
        for (const batch of batches) {
          if (remaining <= 0) break;
          const allocatedQuantity = Math.min(remaining, batch.quantity);
          allocations.push({
            medicineBatch: batch._id,
            batchNumber: batch.batchNumber,
            quantity: allocatedQuantity,
            retailPrice: batch.retailPrice
          });
          remaining -= allocatedQuantity;
        }

        if (remaining > 0) {
          errors.push(`${item.medicineName}: insufficient stock for the requested packs and loose units.`);
          continue;
        }

        const subtotal = item.packQuantity * product.retailPrice +
          item.looseQuantity * (product.looseRetailPrice || product.retailPrice / unitsPerPack);
        const discountAmount = subtotal * item.discountPercent / 100;
        preparedItems.push({
          ...item,
          quantity: requiredBaseQuantity,
          baseQuantity: requiredBaseQuantity,
          packUnit: product.packUnit || 'Pack',
          looseUnit: product.looseUnit || 'Unit',
          unitsPerPack,
          unitLabel: product.looseUnit || 'Unit',
          unitPrice: product.looseRetailPrice || product.retailPrice / unitsPerPack,
          allocations,
          subtotal,
          discountAmount,
          total: subtotal - discountAmount
        });
      }
    }

    if (errors.length) {
      const [medicines, patients] = await Promise.all([availableMedicines(), availablePatients()]);
      return res.status(422).render('inventory/sale', {
        title: 'New Medicine Sale',
        medicines,
        patients,
        form,
        errors
      });
    }

    const invoiceNumber = await createInvoiceNumber();
    const appliedAllocations = [];
    const transactionIds = [];
    let createdSale;

    try {
      for (const item of preparedItems) {
        for (const allocation of item.allocations) {
          const updated = await MedicineBatch.updateOne(
            { _id: allocation.medicineBatch, quantity: { $gte: allocation.quantity } },
            { $inc: { quantity: -allocation.quantity } }
          );
          if (!updated.modifiedCount) {
            throw new Error(`${item.medicineName} stock changed during the sale. Please submit again.`);
          }
          appliedAllocations.push(allocation);

          const transaction = await StockTransaction.create({
            medicineBatch: allocation.medicineBatch,
            type: 'OUT',
            quantity: allocation.quantity,
            reference: invoiceNumber,
            remarks: 'Medicine sale',
            performedBy: req.session?.username || ''
          });
          transactionIds.push(transaction._id);
        }
      }

      const subtotal = preparedItems.reduce((sum, item) => sum + item.subtotal, 0);
      const discountAmount = preparedItems.reduce((sum, item) => sum + item.discountAmount, 0);
      createdSale = await Sale.create({
        invoiceNumber,
        patientMr: form.patientMr,
        customerName: form.customerName || 'Walk-in customer',
        items: preparedItems,
        subtotal,
        discountAmount,
        grandTotal: subtotal - discountAmount,
        performedBy: req.session?.username || ''
      });
    } catch (error) {
      await Promise.all(appliedAllocations.map((allocation) =>
        MedicineBatch.updateOne(
          { _id: allocation.medicineBatch },
          { $inc: { quantity: allocation.quantity } }
        )
      ));
      if (transactionIds.length) {
        await StockTransaction.deleteMany({ _id: { $in: transactionIds } });
      }
      throw error;
    }

    return res.redirect(`/inventory/sales/${createdSale._id}/bill?print=1&message=${encodeURIComponent(`Sale ${invoiceNumber} completed successfully.`)}`);
  } catch (error) {
    if (error.message.includes('stock changed during the sale')) {
      const [medicines, patients] = await Promise.all([availableMedicines(), availablePatients()]);
      return res.status(409).render('inventory/sale', {
        title: 'New Medicine Sale',
        medicines,
        patients,
        form,
        errors: [error.message]
      });
    }
    return next(error);
  }
};

exports.downloadTemplate = (req, res) => {
  const sample = [
    REQUIRED_HEADERS.join(','),
    'Paracetamol 500mg,BATCH-001,2027-12-31,Box,Tablet,100,10,20,800,1000,yes,11'
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="medicine-upload-template.csv"');
  res.send(sample);
};

exports.uploadMedicines = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.redirect('/inventory/upload?error=Please select a CSV file.');
    }

    const rows = parseCsv(req.file.buffer.toString('utf8'));
    if (rows.length < 2) {
      return res.redirect('/inventory/upload?error=The CSV file has no medicine rows.');
    }

    const headers = rows[0].map(normalizeHeader);
    const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
    if (missingHeaders.length) {
      return res.redirect(`/inventory/upload?error=${encodeURIComponent(`Missing columns: ${missingHeaders.join(', ')}`)}`);
    }

    const imported = [];
    const errors = [];

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const values = Object.fromEntries(headers.map((header, index) => [header, rows[rowIndex][index] || '']));
      const unitsPerPack = Number(values.units_per_pack);
      const packsReceived = Number(values.packs_received);
      const looseReceived = Number(values.loose_received);
      const quantity = packsReceived * unitsPerPack + looseReceived;
      const purchasePrice = Number(values.purchase_price);
      const retailPrice = Number(values.retail_price);
      const allowLooseSale = ['yes', 'true', '1'].includes(String(values.allow_loose_sale).toLowerCase());
      const looseRetailPrice = Number(values.loose_retail_price || 0);
      const expiryDate = new Date(`${values.expiry_date}T00:00:00.000Z`);
      const lineNumber = rowIndex + 1;

      if (!values.medicine_name || !values.batch_number) {
        errors.push(`Row ${lineNumber}: medicine name and batch number are required.`);
      } else if (!values.pack_unit || !values.loose_unit || !Number.isInteger(unitsPerPack) || unitsPerPack < 1) {
        errors.push(`Row ${lineNumber}: valid pack unit, loose unit, and units per pack are required.`);
      } else if (!Number.isInteger(packsReceived) || packsReceived < 0 || !Number.isInteger(looseReceived) || looseReceived < 0 || looseReceived >= unitsPerPack || quantity <= 0) {
        errors.push(`Row ${lineNumber}: enter valid pack and loose quantities; loose must be less than units per pack.`);
      } else if (!Number.isFinite(purchasePrice) || purchasePrice < 0 ||
                 !Number.isFinite(retailPrice) || retailPrice < 0 ||
                 (allowLooseSale && (!Number.isFinite(looseRetailPrice) || looseRetailPrice < 0))) {
        errors.push(`Row ${lineNumber}: prices must be valid non-negative numbers.`);
      } else if (Number.isNaN(expiryDate.getTime())) {
        errors.push(`Row ${lineNumber}: expiry date must use YYYY-MM-DD.`);
      } else {
        imported.push({
          medicineName: values.medicine_name,
          batchNumber: values.batch_number,
          expiryDate,
          quantity,
          purchasePrice,
          retailPrice,
          packUnit: values.pack_unit,
          looseUnit: values.loose_unit,
          unitsPerPack,
          allowLooseSale,
          looseRetailPrice: allowLooseSale ? looseRetailPrice : 0,
          lineNumber
        });
      }
    }

    if (errors.length) {
      return res.status(422).render('inventory/upload', {
        title: 'Upload Medicines',
        importErrors: errors.slice(0, 20)
      });
    }

    for (const item of imported) {
      const batch = await MedicineBatch.findOneAndUpdate(
        {
          medicineName: item.medicineName,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate
        },
        {
          $inc: { quantity: item.quantity },
          $set: {
            purchasePrice: item.purchasePrice,
            retailPrice: item.retailPrice,
            packUnit: item.packUnit,
            looseUnit: item.looseUnit,
            unitsPerPack: item.unitsPerPack,
            allowLooseSale: item.allowLooseSale,
            looseRetailPrice: item.looseRetailPrice
          }
        },
        { upsert: true, new: true, runValidators: true }
      );

      await StockTransaction.create({
        medicineBatch: batch._id,
        type: 'IN',
        quantity: item.quantity,
        reference: req.file.originalname,
        remarks: 'Bulk CSV upload',
        performedBy: req.session?.username || ''
      });
    }

    return res.redirect(`/inventory/upload?message=${encodeURIComponent(`${imported.length} medicine rows imported successfully.`)}`);
  } catch (error) {
    next(error);
  }
};
