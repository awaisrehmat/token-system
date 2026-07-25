const mongoose = require('mongoose');

const dailyCounterSchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  sequence: { type: Number, required: true, min: 0, default: 0 }
});

module.exports = mongoose.model('DailyCounter', dailyCounterSchema);
