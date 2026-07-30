const MedicineBatch = require('../models/MedicineBatch');
const StockTransaction = require('../models/StockTransaction');
const Sale = require('../models/Sale');
const SaleCounter = require('../models/SaleCounter');
const { getClinicDate } = require('../utils/helpers');

const REQUIRED_HEADERS = [
  'medicine_name',
  'batch_number',
  'expiry_date',
  'quantity',
  'purchase_price',
  'retail_price'
];

exports.index = async (req, res, next) => {
  try {
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

    const summary = batches.reduce((totals, batch) => {
      totals.quantity += batch.quantity;
      totals.stockValue += batch.quantity * batch.purchasePrice;
      if (batch.quantity > 0 && batch.expiryDate < new Date()) totals.expired += 1;
      return totals;
    }, { quantity: 0, stockValue: 0, expired: 0 });

    res.render('inventory/index', {
      title: 'Medicine Inventory',
      batches,
      search,
      stockStatus,
      expiryStatus,
      sort,
      summary
    });
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

async function availableMedicines() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return MedicineBatch.aggregate([
    { $match: { quantity: { $gt: 0 }, expiryDate: { $gte: today } } },
    { $sort: { expiryDate: 1 } },
    {
      $group: {
        _id: '$medicineName',
        availableQuantity: { $sum: '$quantity' },
        retailPrice: { $first: '$retailPrice' },
        nextExpiry: { $first: '$expiryDate' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
}

exports.showSale = async (req, res, next) => {
  try {
    res.render('inventory/sale', {
      title: 'New Medicine Sale',
      medicines: await availableMedicines(),
      form: { customerName: '', items: Array.from({ length: 4 }, () => ({})) },
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

    const sale = await Sale.findById(req.params.id).lean();
    if (!sale) {
      return res.status(404).render('error', {
        title: 'Sale Not Found',
        pageMessage: 'The requested sale could not be found.'
      });
    }

    return res.render('inventory/bill', {
      title: `Bill ${sale.invoiceNumber}`,
      sale
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
      String(item.quantity || '').trim()
    )
    .map((item) => ({
      medicineName: String(item.medicineName || '').trim(),
      quantity: Number(item.quantity),
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
    customerName: String(req.body.customerName || '').trim(),
    items
  };
  const errors = [];

  if (!items.length) errors.push('Add at least one medicine.');
  for (const [index, item] of items.entries()) {
    if (!item.medicineName) errors.push(`Item ${index + 1}: select a medicine.`);
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      errors.push(`Item ${index + 1}: quantity must be greater than zero.`);
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
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const preparedItems = [];

    if (!errors.length) {
      for (const item of items) {
        const batches = await MedicineBatch.find({
          medicineName: item.medicineName,
          quantity: { $gt: 0 },
          expiryDate: { $gte: today }
        }).sort({ expiryDate: 1, createdAt: 1 }).lean();

        let remaining = item.quantity;
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
          errors.push(`${item.medicineName}: only ${item.quantity - remaining} available.`);
          continue;
        }

        const subtotal = allocations.reduce(
          (sum, allocation) => sum + allocation.quantity * allocation.retailPrice,
          0
        );
        const discountAmount = subtotal * item.discountPercent / 100;
        preparedItems.push({
          ...item,
          allocations,
          subtotal,
          discountAmount,
          total: subtotal - discountAmount
        });
      }
    }

    if (errors.length) {
      return res.status(422).render('inventory/sale', {
        title: 'New Medicine Sale',
        medicines: await availableMedicines(),
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
      return res.status(409).render('inventory/sale', {
        title: 'New Medicine Sale',
        medicines: await availableMedicines(),
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
    'Paracetamol 500mg,BATCH-001,2027-12-31,100,2.50,3.00'
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
      const quantity = Number(values.quantity);
      const purchasePrice = Number(values.purchase_price);
      const retailPrice = Number(values.retail_price);
      const expiryDate = new Date(`${values.expiry_date}T00:00:00.000Z`);
      const lineNumber = rowIndex + 1;

      if (!values.medicine_name || !values.batch_number) {
        errors.push(`Row ${lineNumber}: medicine name and batch number are required.`);
      } else if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push(`Row ${lineNumber}: quantity must be greater than zero.`);
      } else if (!Number.isFinite(purchasePrice) || purchasePrice < 0 ||
                 !Number.isFinite(retailPrice) || retailPrice < 0) {
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
            retailPrice: item.retailPrice
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
