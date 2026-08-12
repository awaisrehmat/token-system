const mongoose = require('mongoose');

const printSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    header: { type: String, required: true, trim: true, maxlength: 250 },
    footer: { type: String, required: true, trim: true, maxlength: 250 },
    tokenPaperSize: { type: String, enum: ['80MM', 'A4'], default: '80MM' },
    a4ClinicDetails: { type: String, trim: true, maxlength: 400, default: '' },
    a4FooterLeft: { type: String, trim: true, maxlength: 150, default: '' },
    a4FooterRight: { type: String, trim: true, maxlength: 150, default: '' },
    saleHeader: { type: String, required: true, trim: true, maxlength: 250, default: 'My Clinic' },
    saleFooter: { type: String, required: true, trim: true, maxlength: 250, default: 'Thank you for your purchase.' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PrintSetting', printSettingSchema);
