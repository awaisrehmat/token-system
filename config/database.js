const mongoose = require('mongoose');

let connectionPromise = null;

function legacyUsernameFor(user) {
  const normalizedName = String(user.name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 50);
  const base = normalizedName.length >= 3 ? normalizedName : 'user';
  return `${base}-${String(user._id).slice(-6)}`;
}

async function ensureUserIndexes() {
  const User = require('../models/User');
  const legacyUsers = await User.find({
    $or: [
      { username: { $exists: false } },
      { username: null },
      { username: '' }
    ]
  }).select('_id name').lean();

  if (legacyUsers.length) {
    await User.bulkWrite(legacyUsers.map((user) => ({
      updateOne: {
        filter: { _id: user._id },
        update: { $set: { username: legacyUsernameFor(user) } }
      }
    })));
    console.log(`Assigned usernames to ${legacyUsers.length} legacy user account(s)`);
  }

  // Production databases can retain indexes from an older User schema.
  // Reconcile them so an unrelated stale unique index cannot reject inserts.
  await User.syncIndexes();
}

async function ensureInventoryOperationIndexes() {
  const Sale = require('../models/Sale');
  const StockTransaction = require('../models/StockTransaction');
  await Promise.all([Sale.createIndexes(), StockTransaction.createIndexes()]);
}

async function ensurePhysicianTokenIndex() {
  const Patient = require('../models/Patient');
  const DailyCounter = require('../models/DailyCounter');
  const MedicalRecordCounter = require('../models/MedicalRecordCounter');
  let indexes = [];
  try {
    indexes = await Patient.collection.indexes();
  } catch (error) {
    // A fresh database has no patients namespace until its collection or first
    // index is created. In that case there are no legacy indexes to migrate.
    if (error.codeName !== 'NamespaceNotFound' && error.code !== 26) throw error;
  }
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

  await ensureRegistrationKeyIndex(Patient);

  await MedicalRecordCounter.createIndexes();
  await backfillMedicalRecordNumbers(Patient, MedicalRecordCounter);
  await Promise.all([Patient.createIndexes(), DailyCounter.createIndexes()]);
}

async function ensureRegistrationKeyIndex(Patient) {
  const indexName = 'registrationKey_1';

  // An earlier schema briefly created this index as sparse but non-unique.
  // Reconcile that exact stale definition before Mongoose creates indexes.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let indexes = [];
    try {
      indexes = await Patient.collection.indexes();
    } catch (error) {
      if (error.codeName !== 'NamespaceNotFound' && error.code !== 26) throw error;
    }
    const existing = indexes.find((index) => index.name === indexName);
    if (existing?.unique && existing.sparse) return;

    if (existing) {
      try {
        await Patient.collection.dropIndex(indexName);
      } catch (error) {
        // Another application instance may be running the same migration.
        if (error.codeName !== 'IndexNotFound' && error.code !== 27) throw error;
      }
    }

    try {
      await Patient.collection.createIndex(
        { registrationKey: 1 },
        { name: indexName, unique: true, sparse: true }
      );
      return;
    } catch (error) {
      // Re-read the index when another instance changed it concurrently.
      if (![85, 86].includes(error.code)) throw error;
    }
  }

  throw new Error('The patient registration-key index could not be reconciled.');
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
        await Promise.all([
          ensurePhysicianTokenIndex(),
          ensureUserIndexes(),
          ensureInventoryOperationIndexes()
        ]);
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
