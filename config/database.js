const mongoose = require('mongoose');

let connectionPromise = null;

async function ensurePhysicianTokenIndex() {
  const Patient = require('../models/Patient');
  const DailyCounter = require('../models/DailyCounter');
  const MedicalRecordCounter = require('../models/MedicalRecordCounter');
  const indexes = await Patient.collection.indexes();
  const oldIndex = indexes.find((index) => index.name === 'tokenDate_1_tokenNumber_1');
  const oldUniqueMrIndex = indexes.find((index) => index.name === 'mrNumber_1' && index.unique);

  if (oldIndex) {
    try {
      await Patient.collection.dropIndex(oldIndex.name);
    } catch (error) {
      // Another serverless instance may have completed the same migration.
      if (error.codeName !== 'IndexNotFound' && error.code !== 27) throw error;
    }
  }

  if (oldUniqueMrIndex) {
    try {
      await Patient.collection.dropIndex(oldUniqueMrIndex.name);
    } catch (error) {
      if (error.codeName !== 'IndexNotFound' && error.code !== 27) throw error;
    }
  }

  await MedicalRecordCounter.createIndexes();
  await backfillMedicalRecordNumbers(Patient, MedicalRecordCounter);
  await Promise.all([Patient.createIndexes(), DailyCounter.createIndexes()]);
}

async function incrementMrCounter(MedicalRecordCounter, year) {
  try {
    return await MedicalRecordCounter.findOneAndUpdate(
      { year },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    return MedicalRecordCounter.findOneAndUpdate(
      { year },
      { $inc: { sequence: 1 } },
      { new: true }
    );
  }
}

async function backfillMedicalRecordNumbers(Patient, MedicalRecordCounter) {
  const patients = await Patient.find({
    $or: [{ mrNumber: { $exists: false } }, { mrNumber: null }, { mrNumber: '' }]
  })
    .select('_id tokenDate createdAt')
    .sort({ createdAt: 1 })
    .lean();

  for (const patient of patients) {
    const fallbackYear = new Date(patient.createdAt || Date.now()).getUTCFullYear();
    const year = Number(String(patient.tokenDate || '').slice(0, 4)) || fallbackYear;
    const counter = await incrementMrCounter(MedicalRecordCounter, year);
    const mrNumber = `MR-${year}-${String(counter.sequence).padStart(6, '0')}`;
    await Patient.updateOne(
      { _id: patient._id, $or: [{ mrNumber: { $exists: false } }, { mrNumber: null }, { mrNumber: '' }] },
      { $set: { mrNumber } }
    );
  }
}

async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing from the environment.');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000
      })
      .then(async () => {
        await ensurePhysicianTokenIndex();
        console.log('Connected to MongoDB');
        return mongoose.connection;
      })
      .catch((error) => {
        connectionPromise = null;
        throw error;
      });
  }

  return connectionPromise;
}

module.exports = connectDatabase;
