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
  performedBy: { type: String, trim: true, default: '' },
  requestKey: { type: String, trim: true },
  requestFingerprint: { type: String, trim: true },
  requestDedupKey: { type: String, trim: true },
  operationStatus: { type: String, enum: ['PROCESSING', 'COMPLETED'], default: 'COMPLETED' },
  adjustmentDirection: { type: String, enum: ['IN', 'OUT', 'NONE'], default: undefined },
  changes: [{
    field: { type: String, required: true },
    label: { type: String, required: true },
    before: { type: String, default: '' },
    after: { type: String, default: '' }
  }]
}, { timestamps: true });

stockTransactionSchema.index({ requestKey: 1 }, { unique: true, sparse: true });
stockTransactionSchema.index({ requestDedupKey: 1 }, { unique: true, sparse: true });
stockTransactionSchema.index({ requestFingerprint: 1, createdAt: -1 });

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);
