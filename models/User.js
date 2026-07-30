const crypto = require('crypto');
const mongoose = require('mongoose');

const ROLES = ['admin', 'receptionist', 'pharmacist'];

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: 60
  },
  passwordHash: { type: String, required: true, select: false },
  passwordSalt: { type: String, required: true, select: false },
  role: { type: String, required: true, enum: ROLES },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true });

userSchema.methods.setPassword = function setPassword(password) {
  this.passwordSalt = crypto.randomBytes(16).toString('hex');
  this.passwordHash = crypto.scryptSync(password, this.passwordSalt, 64).toString('hex');
};

userSchema.methods.verifyPassword = function verifyPassword(password) {
  const candidate = crypto.scryptSync(password, this.passwordSalt, 64);
  const stored = Buffer.from(this.passwordHash, 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
};

userSchema.statics.ROLES = ROLES;

module.exports = mongoose.model('User', userSchema);
