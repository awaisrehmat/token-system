const mongoose = require('mongoose');

const medicineBatchSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicineProduct', index: true },
  medicineName: { type: String, required: true, trim: true },
  batchNumber: { type: String, required: true, trim: true },
  expiryDate: { type: Date, required: true },
  quantity: { type: Number, required: true, min: 0, default: 0 },
  purchasePrice: { type: Number, required: true, min: 0 },
  retailPrice: { type: Number, required: true, min: 0 },
  packUnit: { type: String, required: true, trim: true, default: 'Pack' },
  looseUnit: { type: String, required: true, trim: true, default: 'Unit' },
  unitsPerPack: { type: Number, required: true, min: 1, default: 1 },
  allowLooseSale: { type: Boolean, default: false },
  looseRetailPrice: { type: Number, required: true, min: 0, default: 0 }
}, { timestamps: true });

medicineBatchSchema.index(
  { medicineName: 1, batchNumber: 1, expiryDate: 1 },
  { unique: true }
);

module.exports = mongoose.model('MedicineBatch', medicineBatchSchema);
