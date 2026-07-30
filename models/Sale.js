const mongoose = require('mongoose');

const allocationSchema = new mongoose.Schema({
  medicineBatch: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicineBatch', required: true },
  batchNumber: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0.000001 },
  retailPrice: { type: Number, required: true, min: 0 }
}, { _id: false });

const saleItemSchema = new mongoose.Schema({
  medicineName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0.000001 },
  discountPercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
  subtotal: { type: Number, required: true, min: 0 },
  discountAmount: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
  allocations: { type: [allocationSchema], default: [] }
}, { _id: false });

const saleSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true, trim: true },
  customerName: { type: String, trim: true, default: 'Walk-in customer' },
  items: { type: [saleItemSchema], required: true },
  subtotal: { type: Number, required: true, min: 0 },
  discountAmount: { type: Number, required: true, min: 0 },
  grandTotal: { type: Number, required: true, min: 0 },
  performedBy: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['ACTIVE', 'VOID'], default: 'ACTIVE' },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: String, trim: true, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Sale', saleSchema);
