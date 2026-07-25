const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema(
  {
    patientName: { type: String, required: true, trim: true, maxlength: 100 },
    age: { type: Number, required: true, min: 0, max: 130 },
    sex: { type: String, required: true, enum: ['Male', 'Female', 'Other'] },
    cnic: {
      type: String,
      required: true,
      validate: {
        validator: (value) => /^\d{13}$/.test(value),
        message: 'CNIC must contain exactly 13 digits.'
      }
    },
    contactNumber: { type: String, required: true, trim: true, maxlength: 30 },
    address: { type: String, required: true, trim: true, maxlength: 250 },
    consultant: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultant', required: true },
    patientType: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    tokenNumber: { type: String, required: true, match: [/^\d+$/, 'Token number must contain digits only.'] },
    tokenDate: { type: String, required: true, match: [/^\d{4}-\d{2}-\d{2}$/, 'Invalid token date.'] }
  },
  { timestamps: true }
);

patientSchema.index({ tokenDate: 1, tokenNumber: 1 }, { unique: true });
patientSchema.index({ tokenDate: 1, createdAt: -1 });

module.exports = mongoose.model('Patient', patientSchema);
