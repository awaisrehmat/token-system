const mongoose = require('mongoose');

let connectionPromise = null;

async function ensurePhysicianTokenIndex() {
  const Patient = require('../models/Patient');
  const DailyCounter = require('../models/DailyCounter');
  const indexes = await Patient.collection.indexes();
  const oldIndex = indexes.find((index) => index.name === 'tokenDate_1_tokenNumber_1');

  if (oldIndex) {
    try {
      await Patient.collection.dropIndex(oldIndex.name);
    } catch (error) {
      // Another serverless instance may have completed the same migration.
      if (error.codeName !== 'IndexNotFound' && error.code !== 27) throw error;
    }
  }

  await Promise.all([Patient.createIndexes(), DailyCounter.createIndexes()]);
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
