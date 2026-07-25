const mongoose = require('mongoose');

const printSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    header: { type: String, required: true, trim: true, maxlength: 120 },
    footer: { type: String, required: true, trim: true, maxlength: 250 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PrintSetting', printSettingSchema);
