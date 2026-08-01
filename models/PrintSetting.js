const mongoose = require('mongoose');

const printSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    header: { type: String, required: true, trim: true, maxlength: 120 },
    footer: { type: String, required: true, trim: true, maxlength: 250 },
    saleHeader: { type: String, required: true, trim: true, maxlength: 120, default: 'My Clinic' },
    saleFooter: { type: String, required: true, trim: true, maxlength: 250, default: 'Thank you for your purchase.' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PrintSetting', printSettingSchema);
