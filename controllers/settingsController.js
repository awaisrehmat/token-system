const PrintSetting = require('../models/PrintSetting');

const DEFAULTS = {
  key: 'default',
  header: 'My Clinic',
  footer: 'Please wait for your token number to be called.'
};

exports.index = async (req, res, next) => {
  try {
    const printSetting = await PrintSetting.findOne({ key: 'default' }).lean() || DEFAULTS;
    res.render('settings/index', {
      title: 'Receipt Settings',
      printSetting,
      errors: []
    });
  } catch (error) {
    next(error);
  }
};

exports.updateReceipt = async (req, res, next) => {
  const printSetting = {
    header: String(req.body.header || '').trim(),
    footer: String(req.body.footer || '').trim()
  };
  const errors = [];
  if (!printSetting.header) errors.push('Receipt header is required.');
  if (printSetting.header.length > 120) errors.push('Receipt header cannot exceed 120 characters.');
  if (!printSetting.footer) errors.push('Receipt footer is required.');
  if (printSetting.footer.length > 250) errors.push('Receipt footer cannot exceed 250 characters.');

  try {
    if (errors.length) {
      return res.status(422).render('settings/index', {
        title: 'Receipt Settings',
        printSetting,
        errors
      });
    }

    await PrintSetting.findOneAndUpdate(
      { key: 'default' },
      { $set: printSetting, $setOnInsert: { key: 'default' } },
      { upsert: true, runValidators: true }
    );
    return res.redirect(`/settings?message=${encodeURIComponent('Receipt settings saved successfully.')}`);
  } catch (error) {
    return next(error);
  }
};
