const crypto = require('crypto');

function safeEqual(value, expected) {
  const valueBuffer = Buffer.from(String(value));
  const expectedBuffer = Buffer.from(String(expected));
  return valueBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  return res.redirect(`/login?error=${encodeURIComponent('Please sign in to continue.')}`);
}

function showLogin(req, res) {
  if (req.session?.authenticated) return res.redirect('/');
  return res.render('login', { title: 'Sign In' });
}

function login(req, res, next) {
  const configuredUsername = process.env.ADMIN_USERNAME;
  const configuredPassword = process.env.ADMIN_PASSWORD;

  if (!configuredUsername || !configuredPassword || (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET)) {
    return res.redirect(`/login?error=${encodeURIComponent('Login credentials are not configured on the server.')}`);
  }

  const usernameValid = safeEqual(req.body.username || '', configuredUsername);
  const passwordValid = safeEqual(req.body.password || '', configuredPassword);

  if (!usernameValid || !passwordValid) {
    return res.redirect(`/login?error=${encodeURIComponent('Invalid username or password.')}`);
  }

  return req.session.regenerate((error) => {
    if (error) return next(error);
    req.session.authenticated = true;
    req.session.username = configuredUsername;
    return req.session.save((saveError) => {
      if (saveError) return next(saveError);
      return res.redirect(`/?message=${encodeURIComponent('Welcome back.')}`);
    });
  });
}

function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('doctor_token_session');
    return res.redirect(`/login?message=${encodeURIComponent('You have signed out successfully.')}`);
  });
}

module.exports = { requireAuth, showLogin, login, logout };
