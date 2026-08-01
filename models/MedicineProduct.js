const mongoose = require('mongoose');

const medicineProductSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 150 },
  normalizedName: { type: String, required: true, unique: true, trim: true },
  packUnit: { type: String, required: true, trim: true, default: 'Pack' },
  looseUnit: { type: String, required: true, trim: true, default: 'Unit' },
  unitsPerPack: { type: Number, required: true, min: 1, default: 1 },
  allowLooseSale: { type: Boolean, default: false },
  packagingStatus: { type: String, enum: ['ACTIVE', 'CONFLICT'], default: 'ACTIVE' }
}, { timestamps: true });

module.exports = mongoose.model('MedicineProduct', medicineProductSchema);
