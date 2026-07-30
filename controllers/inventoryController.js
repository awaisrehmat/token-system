const MedicineBatch = require('../models/MedicineBatch');
const StockTransaction = require('../models/StockTransaction');

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
    const query = search
      ? {
          $or: [
            { medicineName: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
            { batchNumber: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
          ]
        }
      : {};

    const batches = await MedicineBatch.find(query)
      .sort({ medicineName: 1, expiryDate: 1 })
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
