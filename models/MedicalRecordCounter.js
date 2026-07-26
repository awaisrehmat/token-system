const mongoose = require('mongoose');

const medicalRecordCounterSchema = new mongoose.Schema({
  year: { type: Number, required: true, unique: true },
  sequence: { type: Number, required: true, min: 0, default: 0 }
});

module.exports = mongoose.model('MedicalRecordCounter', medicalRecordCounterSchema);
