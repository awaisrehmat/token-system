const crypto = require('crypto');
const User = require('../models/User');

const ROLE_PERMISSIONS = {
  admin: ['*'],
  receptionist: ['patients.manage', 'physicians.view'],
  pharmacist: ['inventory.view', 'sales.manage', 'stock.upload']
};

function safeEqual(value, expected) {
  const valueBuffer = Buffer.from(String(value));
  const expectedBuffer = Buffer.from(String(expected));
  return valueBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || [];
}

function hasPermission(req, permission) {
  const permissions = req.session?.permissions || [];
  return permissions.includes('*') || permissions.includes(permission);
}

async function requireAuth(req, res, next) {
  if (req.session?.authenticated) {
    if (req.session.userId) {
      try {
        const user = await User.findById(req.session.userId).select('name username role isActive').lean();
        if (!user?.isActive) {
          return req.session.destroy(() =>
            res.redirect(`/login?error=${encodeURIComponent('Your account is inactive.')}`)
          );
        }
        req.session.username = user.username;
        req.session.displayName = user.name;
        req.session.role = user.role;
        req.session.permissions = permissionsFor(user.role);
      } catch (error) {
        return next(error);
      }
    }
    // Upgrade sessions created before role support without locking out the
    // configured environment administrator.
    if (!req.session.role && req.session.username === process.env.ADMIN_USERNAME) {
      req.session.role = 'admin';
      req.session.displayName = req.session.username;
      req.session.permissions = permissionsFor('admin');
    }
    return next();
  }
  return res.redirect(`/login?error=${encodeURIComponent('Please sign in to continue.')}`);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (hasPermission(req, permission)) return next();
    return res.status(403).render('error', {
      title: 'Access Denied',
      pageMessage: 'Your role does not have permission to access this page.'
    });
  };
}

function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (permissions.some((permission) => hasPermission(req, permission))) return next();
    return res.status(403).render('error', {
      title: 'Access Denied',
      pageMessage: 'Your role does not have permission to access this page.'
    });
  };
}

function showLogin(req, res) {
  if (req.session?.authenticated) return res.redirect('/');
  return res.render('login', { title: 'Sign In' });
}

async function login(req, res, next) {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ username }).select('+passwordHash +passwordSalt');
    let sessionUser;

    if (user && user.isActive && user.verifyPassword(password)) {
      user.lastLoginAt = new Date();
      await user.save();
      sessionUser = {
        id: String(user._id),
        username: user.username,
        name: user.name,
        role: user.role
      };
    } else {
      const configuredUsername = process.env.ADMIN_USERNAME;
      const configuredPassword = process.env.ADMIN_PASSWORD;
      const environmentAdminValid = configuredUsername && configuredPassword
        && safeEqual(username, configuredUsername.toLowerCase())
        && safeEqual(password, configuredPassword);

      if (!environmentAdminValid) {
        return res.redirect(`/login?error=${encodeURIComponent('Invalid username or password.')}`);
      }
      sessionUser = {
        id: null,
        username: configuredUsername,
        name: configuredUsername,
        role: 'admin'
      };
    }

    return req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.authenticated = true;
      req.session.userId = sessionUser.id;
      req.session.username = sessionUser.username;
      req.session.displayName = sessionUser.name;
      req.session.role = sessionUser.role;
      req.session.permissions = permissionsFor(sessionUser.role);
      return req.session.save((saveError) => {
        if (saveError) return next(saveError);
        return res.redirect(`/?message=${encodeURIComponent('Welcome back.')}`);
      });
    });
  } catch (error) {
    return next(error);
  }
}

function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('doctor_token_session');
    return res.redirect(`/login?message=${encodeURIComponent('You have signed out successfully.')}`);
  });
}

module.exports = {
  ROLE_PERMISSIONS,
  permissionsFor,
  hasPermission,
  requireAuth,
  requirePermission,
  requireAnyPermission,
  showLogin,
  login,
  logout
};
