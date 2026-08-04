const User = require('../models/User');

const ROLE_LABELS = {
  admin: 'Admin',
  receptionist: 'Receptionist',
  pharmacist: 'Pharmacist'
};

async function renderCreateError(res, form, errors, status = 422) {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  return res.status(status).render('users/index', {
    title: 'Users & Permissions',
    users,
    roleLabels: ROLE_LABELS,
    errors,
    form
  });
}

exports.index = async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    res.render('users/index', {
      title: 'Users & Permissions',
      users,
      roleLabels: ROLE_LABELS,
      errors: [],
      form: {}
    });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  const form = {
    name: String(req.body.name || '').trim(),
    username: String(req.body.username || '').trim().toLowerCase(),
    role: String(req.body.role || '').trim()
  };
  const password = String(req.body.password || '');
  const errors = [];

  if (!form.name) errors.push('Name is required.');
  if (!/^[a-z0-9._-]{3,60}$/.test(form.username)) {
    errors.push('Username must be 3–60 characters using letters, numbers, dot, underscore, or hyphen.');
  }
  if (!User.ROLES.includes(form.role)) errors.push('Select a valid role.');
  if (password.length < 8) errors.push('Password must contain at least 8 characters.');

  try {
    if (await User.exists({ username: form.username })) errors.push('That username is already in use.');
    if (errors.length) {
      return renderCreateError(res, form, errors);
    }

    const user = new User(form);
    user.setPassword(password);
    await user.save();
    return res.redirect(`/users?message=${encodeURIComponent(`${user.name} was added successfully.`)}`);
  } catch (error) {
    console.error('Unable to create user:', error);
    if (error.code === 11000) {
      return renderCreateError(res, form, ['That username is already in use.'], 409);
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors || {}).map((item) => item.message);
      return renderCreateError(res, form, messages.length ? messages : ['The user details are invalid.']);
    }
    if (error.code === 'ERR_CRYPTO_INVALID_SCRYPT_PARAMS' || /scrypt/i.test(error.message || '')) {
      return renderCreateError(res, form, ['The server could not securely process this password. Please try another password or check the production runtime configuration.'], 500);
    }
    return renderCreateError(res, form, [`User could not be created: ${error.message || 'Unknown server error.'}`], 500);
  }
};

exports.toggleStatus = async (req, res, next) => {
  try {
    if (String(req.session.userId || '') === req.params.id) {
      return res.redirect(`/users?error=${encodeURIComponent('You cannot deactivate your own account.')}`);
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.redirect(`/users?error=${encodeURIComponent('User not found.')}`);
    user.isActive = !user.isActive;
    await user.save();
    return res.redirect(`/users?message=${encodeURIComponent(`${user.name} is now ${user.isActive ? 'active' : 'inactive'}.`)}`);
  } catch (error) {
    return next(error);
  }
};

exports.updateRole = async (req, res, next) => {
  try {
    if (String(req.session.userId || '') === req.params.id) {
      return res.redirect(`/users?error=${encodeURIComponent('You cannot change your own role.')}`);
    }
    const role = String(req.body.role || '');
    if (!User.ROLES.includes(role)) {
      return res.redirect(`/users?error=${encodeURIComponent('Select a valid role.')}`);
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    );
    if (!user) return res.redirect(`/users?error=${encodeURIComponent('User not found.')}`);
    return res.redirect(`/users?message=${encodeURIComponent(`${user.name}'s role was updated.`)}`);
  } catch (error) {
    return next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const password = String(req.body.password || '');
    if (password.length < 8) {
      return res.redirect(`/users?error=${encodeURIComponent('New password must contain at least 8 characters.')}`);
    }
    const user = await User.findById(req.params.id).select('+passwordHash +passwordSalt');
    if (!user) return res.redirect(`/users?error=${encodeURIComponent('User not found.')}`);
    user.setPassword(password);
    await user.save();
    return res.redirect(`/users?message=${encodeURIComponent(`Password reset for ${user.name}.`)}`);
  } catch (error) {
    return next(error);
  }
};
