const mongoose = require('mongoose');

const dailyCounterSchema = new mongoose.Schema({
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  physician: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultant', required: true },
  sequence: { type: Number, required: true, min: 0, default: 0 }
});

dailyCounterSchema.index({ date: 1, physician: 1 }, { unique: true });

// A new collection avoids conflicts with counters created by older versions,
// where one sequence was shared by the entire clinic.
module.exports = mongoose.model('DailyCounter', dailyCounterSchema, 'physicianDailyCounters');
