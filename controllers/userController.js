const User = require('../models/User');

const ROLE_LABELS = {
  admin: 'Admin',
  receptionist: 'Receptionist',
  pharmacist: 'Pharmacist'
};

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
      const users = await User.find().sort({ createdAt: -1 }).lean();
      return res.status(422).render('users/index', {
        title: 'Users & Permissions',
        users,
        roleLabels: ROLE_LABELS,
        errors,
        form
      });
    }

    const user = new User(form);
    user.setPassword(password);
    await user.save();
    return res.redirect(`/users?message=${encodeURIComponent(`${user.name} was added successfully.`)}`);
  } catch (error) {
    return next(error);
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
