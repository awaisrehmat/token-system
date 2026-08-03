const Consultant = require('../models/Consultant');

function safeReturnTo(value) {
  const path = String(value || '');
  if (path === '/patients/new' || /^\/patients\/[a-f\d]{24}\/edit$/i.test(path)) return path;
  return '/consultants';
}

exports.index = async (req, res, next) => {
  try {
    const consultants = await Consultant.find().sort({ name: 1 }).lean();
    res.render('consultants/index', { title: 'Physician Management', consultants });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const specialization = String(req.body.specialization || '').trim();
    const returnTo = safeReturnTo(req.body.returnTo);

    if (!name || !specialization) {
      return res.redirect(`${returnTo}?error=${encodeURIComponent('Physician name and specialization are required.')}`);
    }

    await Consultant.create({ name, specialization });
    return res.redirect(`${returnTo}?message=${encodeURIComponent('Physician added successfully.')}`);
  } catch (error) {
    if (error.code === 11000) {
      const returnTo = safeReturnTo(req.body.returnTo);
      return res.redirect(`${returnTo}?error=${encodeURIComponent('A physician with this name already exists.')}`);
    }
    return next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const specialization = String(req.body.specialization || '').trim();
    if (!name || !specialization) {
      return res.redirect(`/consultants?error=${encodeURIComponent('Physician name and specialization are required.')}`);
    }
    const consultant = await Consultant.findByIdAndUpdate(
      req.params.id,
      { name, specialization },
      { new: true, runValidators: true }
    );
    if (!consultant) return res.redirect(`/consultants?error=${encodeURIComponent('Physician was not found.')}`);
    return res.redirect(`/consultants?message=${encodeURIComponent('Physician updated successfully.')}`);
  } catch (error) {
    if (error.code === 11000) {
      return res.redirect(`/consultants?error=${encodeURIComponent('A physician with this name already exists.')}`);
    }
    return next(error);
  }
};

exports.remove = async (req, res, next) => {
  try {
    await Consultant.findByIdAndDelete(req.params.id);
    res.redirect(`/consultants?message=${encodeURIComponent('Physician deleted successfully.')}`);
  } catch (error) {
    next(error);
  }
};
