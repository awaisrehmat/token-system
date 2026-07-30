const mongoose = require('mongoose');

const stockTransactionSchema = new mongoose.Schema({
  medicineBatch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MedicineBatch',
    required: true
  },
  type: { type: String, enum: ['IN', 'OUT', 'ADJUSTMENT'], required: true },
  quantity: { type: Number, required: true, min: 0.000001 },
  reference: { type: String, trim: true, default: '' },
  remarks: { type: String, trim: true, default: '' },
  performedBy: { type: String, trim: true, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);
