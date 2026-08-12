const PrintSetting = require('../models/PrintSetting');

const DEFAULTS = {
  key: 'default',
  header: 'My Clinic',
  footer: 'Please wait for your token number to be called.',
  tokenPaperSize: '80MM',
  a4ClinicDetails: 'Near Degree College, Multan Road, Phool Nagar, District Kasur\nPMDC Reg. No. 18127-P\nPHC Reg No. R-07893',
  a4FooterLeft: 'Contact Number 049-4510511',
  a4FooterRight: 'Clinic Timing: 8:30 AM to 4:00 PM',
  saleHeader: 'My Clinic',
  saleFooter: 'Thank you for your purchase.'
};

exports.index = async (req, res, next) => {
  try {
    const saved = await PrintSetting.findOne({ key: 'default' }).lean();
    const printSetting = { ...DEFAULTS, ...(saved || {}) };
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
    footer: String(req.body.footer || '').trim(),
    tokenPaperSize: req.body.tokenA4 === 'on' ? 'A4' : '80MM',
    a4ClinicDetails: String(req.body.a4ClinicDetails || '').trim(),
    a4FooterLeft: String(req.body.a4FooterLeft || '').trim(),
    a4FooterRight: String(req.body.a4FooterRight || '').trim()
  };
  const errors = [];
  if (!printSetting.header) errors.push('Receipt header is required.');
  if (printSetting.header.length > 250) errors.push('Receipt header cannot exceed 250 characters.');
  if (!printSetting.footer) errors.push('Receipt footer is required.');
  if (printSetting.footer.length > 250) errors.push('Receipt footer cannot exceed 250 characters.');

  try {
    if (errors.length) {
      const saved = await PrintSetting.findOne({ key: 'default' }).lean() || DEFAULTS;
      return res.status(422).render('settings/index', {
        title: 'Receipt Settings',
        printSetting: { ...saved, ...printSetting },
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

exports.updateSaleReceipt = async (req, res, next) => {
  const saleHeader = String(req.body.saleHeader || '').trim();
  const saleFooter = String(req.body.saleFooter || '').trim();
  const errors = [];
  if (!saleHeader) errors.push('Sale receipt header is required.');
  if (saleHeader.length > 250) errors.push('Sale receipt header cannot exceed 250 characters.');
  if (!saleFooter) errors.push('Sale receipt footer is required.');
  if (saleFooter.length > 250) errors.push('Sale receipt footer cannot exceed 250 characters.');

  try {
    if (errors.length) {
      const saved = await PrintSetting.findOne({ key: 'default' }).lean() || DEFAULTS;
      return res.status(422).render('settings/index', {
        title: 'Receipt Settings',
        printSetting: { ...saved, saleHeader, saleFooter },
        errors
      });
    }
    await PrintSetting.findOneAndUpdate(
      { key: 'default' },
      { $set: { saleHeader, saleFooter }, $setOnInsert: { key: 'default', header: DEFAULTS.header, footer: DEFAULTS.footer } },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return res.redirect(`/settings?message=${encodeURIComponent('Sale receipt settings saved successfully.')}`);
  } catch (error) {
    return next(error);
  }
};
