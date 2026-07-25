const Consultant = require('../models/Consultant');
const PrintSetting = require('../models/PrintSetting');

function safeReturnTo(value) {
  const path = String(value || '');
  if (path === '/patients/new' || /^\/patients\/[a-f\d]{24}\/edit$/i.test(path)) return path;
  return '/consultants';
}

exports.index = async (req, res, next) => {
  try {
    const [consultants, savedPrintSetting] = await Promise.all([
      Consultant.find().sort({ name: 1 }).lean(),
      PrintSetting.findOne({ key: 'default' }).lean()
    ]);
    const printSetting = savedPrintSetting || {
      header: 'My Clinic',
      footer: 'Please wait for your token number to be called.'
    };
    res.render('consultants/index', { title: 'Physician Management', consultants, printSetting });
  } catch (error) {
    next(error);
  }
};

exports.updatePrintSettings = async (req, res, next) => {
  try {
    const header = String(req.body.header || '').trim();
    const footer = String(req.body.footer || '').trim();

    if (!header || !footer) {
      return res.redirect(`/consultants?error=${encodeURIComponent('Print header and footer are required.')}`);
    }
    if (header.length > 120 || footer.length > 250) {
      return res.redirect(`/consultants?error=${encodeURIComponent('Print header or footer is too long.')}`);
    }

    await PrintSetting.findOneAndUpdate(
      { key: 'default' },
      { header, footer },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return res.redirect(`/consultants?message=${encodeURIComponent('Printable header and footer updated successfully.')}`);
  } catch (error) {
    return next(error);
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

exports.remove = async (req, res, next) => {
  try {
    await Consultant.findByIdAndDelete(req.params.id);
    res.redirect(`/consultants?message=${encodeURIComponent('Physician deleted successfully.')}`);
  } catch (error) {
    next(error);
  }
};
