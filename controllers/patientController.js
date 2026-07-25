const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const Consultant = require('../models/Consultant');
const DailyCounter = require('../models/DailyCounter');
const PrintSetting = require('../models/PrintSetting');
const {
  getClinicDate,
  formatDateTime,
  normalizeCnic,
  formatCnic,
  escapeRegex,
  formatToken
} = require('../utils/helpers');

const PAGE_SIZE = 10;

function patientValues(body = {}) {
  return {
    patientName: String(body.patientName || '').trim(),
    age: body.age,
    sex: body.sex,
    cnic: normalizeCnic(body.cnic),
    contactNumber: String(body.contactNumber || '').trim(),
    address: String(body.address || '').trim(),
    consultant: body.consultant,
    patientType: String(body.patientType || '').trim(),
    description: String(body.description || '').trim(),
    tokenDate: body.tokenDate
  };
}

function validatePatient(data) {
  const errors = [];
  if (!data.patientName) errors.push('Patient name is required.');
  if (data.age === '' || Number.isNaN(Number(data.age)) || Number(data.age) < 0 || Number(data.age) > 130) {
    errors.push('Age must be between 0 and 130.');
  }
  if (!['Male', 'Female', 'Other'].includes(data.sex)) errors.push('Please select a valid sex.');
  if (!/^\d{13}$/.test(data.cnic)) errors.push('CNIC must contain exactly 13 digits.');
  if (!data.contactNumber) errors.push('Contact number is required.');
  if (!data.address) errors.push('Address is required.');
  if (!mongoose.isValidObjectId(data.consultant)) errors.push('Please select a consultant.');
  if (!data.patientType) errors.push('Patient type is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.tokenDate || '')) errors.push('A valid date is required.');
  return errors;
}

async function nextToken(date) {
  try {
    const counter = await DailyCounter.findOneAndUpdate(
      { date },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return formatToken(counter.sequence);
  } catch (error) {
    // Two first requests can race while creating today's counter. The unique date
    // index lets one win; the other safely retries against the created document.
    if (error.code === 11000) {
      const counter = await DailyCounter.findOneAndUpdate(
        { date },
        { $inc: { sequence: 1 } },
        { new: true }
      );
      return formatToken(counter.sequence);
    }
    throw error;
  }
}

async function availableGeneratedToken(date) {
  let token;
  let exists;
  do {
    token = await nextToken(date);
    exists = await Patient.exists({ tokenDate: date, tokenNumber: token });
  } while (exists);
  return token;
}

exports.dashboard = async (req, res, next) => {
  try {
    const today = getClinicDate();
    const [todayTotal, counter, recentPatients] = await Promise.all([
      Patient.countDocuments({ tokenDate: today }),
      DailyCounter.findOne({ date: today }).lean(),
      Patient.find().populate('consultant').sort({ createdAt: -1 }).limit(5).lean()
    ]);

    res.render('dashboard', {
      title: 'Dashboard',
      todayTotal,
      currentToken: counter ? formatToken(counter.sequence) : '000',
      recentPatients,
      formatCnic,
      formatDateTime
    });
  } catch (error) {
    next(error);
  }
};

exports.index = async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const date = String(req.query.date || '').trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const query = {};

    if (date) query.tokenDate = date;
    if (search) {
      const safeSearch = escapeRegex(search);
      const cnicDigits = normalizeCnic(search);
      const consultantIds = await Consultant.find({ name: { $regex: safeSearch, $options: 'i' } }).distinct('_id');
      query.$or = [
        { patientName: { $regex: safeSearch, $options: 'i' } },
        { contactNumber: { $regex: safeSearch, $options: 'i' } },
        { tokenNumber: { $regex: safeSearch, $options: 'i' } },
        { address: { $regex: safeSearch, $options: 'i' } },
        { consultant: { $in: consultantIds } }
      ];
      if (cnicDigits) query.$or.push({ cnic: { $regex: escapeRegex(cnicDigits) } });
    }

    const [patients, total] = await Promise.all([
      Patient.find(query)
        .populate('consultant')
        .sort({ tokenDate: -1, createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      Patient.countDocuments(query)
    ]);

    res.render('patients/index', {
      title: 'Patient List',
      patients,
      search,
      date,
      page,
      totalPages: Math.max(Math.ceil(total / PAGE_SIZE), 1),
      formatCnic
    });
  } catch (error) {
    next(error);
  }
};

exports.newForm = async (req, res, next) => {
  try {
    const tokenDate = getClinicDate();
    const consultants = await Consultant.find().sort({ name: 1 }).lean();

    res.render('patients/form', {
      title: 'Register Patient',
      patient: { tokenDate },
      consultants,
      errors: [],
      isEdit: false
    });
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  const data = patientValues(req.body);

  try {
    const errors = validatePatient(data);
    const consultantExists = mongoose.isValidObjectId(data.consultant)
      ? await Consultant.exists({ _id: data.consultant })
      : false;
    if (!consultantExists) errors.push('The selected consultant no longer exists.');

    if (errors.length) {
      const consultants = await Consultant.find().sort({ name: 1 }).lean();
      return res.status(422).render('patients/form', {
        title: 'Register Patient',
        patient: data,
        consultants,
        errors,
        isEdit: false
      });
    }

    data.tokenNumber = await availableGeneratedToken(data.tokenDate);

    const patient = await Patient.create(data);
    return res.redirect(`/patients/${patient._id}/token?message=${encodeURIComponent('Patient registered successfully.')}`);
  } catch (error) {
    if (error.code === 11000) {
      const consultants = await Consultant.find().sort({ name: 1 }).lean();
      return res.status(409).render('patients/form', {
        title: 'Register Patient',
        patient: data,
        consultants,
        errors: ['A token-number conflict occurred. Please submit the form again to generate a new token.'],
        isEdit: false
      });
    }
    return next(error);
  }
};

exports.editForm = async (req, res, next) => {
  try {
    const [patient, consultants] = await Promise.all([
      Patient.findById(req.params.id).lean(),
      Consultant.find().sort({ name: 1 }).lean()
    ]);
    if (!patient) return res.status(404).render('error', { title: 'Patient Not Found', message: 'Patient record not found.' });

    return res.render('patients/form', {
      title: 'Edit Patient',
      patient,
      consultants,
      errors: [],
      isEdit: true
    });
  } catch (error) {
    return next(error);
  }
};

exports.update = async (req, res, next) => {
  const data = patientValues(req.body);
  try {
    const existingPatient = await Patient.findById(req.params.id).select('tokenNumber').lean();
    if (!existingPatient) {
      return res.status(404).render('error', { title: 'Patient Not Found', message: 'Patient record not found.' });
    }
    data.tokenNumber = existingPatient.tokenNumber;

    const errors = validatePatient(data);
    const consultantExists = mongoose.isValidObjectId(data.consultant)
      ? await Consultant.exists({ _id: data.consultant })
      : false;
    if (!consultantExists) errors.push('The selected consultant no longer exists.');

    if (errors.length) {
      const consultants = await Consultant.find().sort({ name: 1 }).lean();
      return res.status(422).render('patients/form', {
        title: 'Edit Patient',
        patient: { ...data, _id: req.params.id },
        consultants,
        errors,
        isEdit: true
      });
    }

    const patient = await Patient.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!patient) return res.status(404).render('error', { title: 'Patient Not Found', message: 'Patient record not found.' });
    return res.redirect(`/patients?message=${encodeURIComponent('Patient updated successfully.')}`);
  } catch (error) {
    if (error.code === 11000) {
      const consultants = await Consultant.find().sort({ name: 1 }).lean();
      return res.status(409).render('patients/form', {
        title: 'Edit Patient',
        patient: { ...data, _id: req.params.id },
        consultants,
        errors: ['This token number is already in use for the selected date.'],
        isEdit: true
      });
    }
    return next(error);
  }
};

exports.remove = async (req, res, next) => {
  try {
    await Patient.findByIdAndDelete(req.params.id);
    res.redirect(`/patients?message=${encodeURIComponent('Patient deleted successfully.')}`);
  } catch (error) {
    next(error);
  }
};

exports.token = async (req, res, next) => {
  try {
    const [patient, savedPrintSetting] = await Promise.all([
      Patient.findById(req.params.id).populate('consultant').lean(),
      PrintSetting.findOne({ key: 'default' }).lean()
    ]);
    if (!patient) return res.status(404).render('error', { title: 'Patient Not Found', message: 'Patient record not found.' });
    const printSetting = savedPrintSetting || {
      header: process.env.CLINIC_NAME || 'My Clinic',
      footer: 'Please wait for your token number to be called.'
    };
    return res.render('patients/token', {
      title: `Token ${patient.tokenNumber}`,
      patient,
      printSetting,
      formatCnic,
      formatDateTime
    });
  } catch (error) {
    return next(error);
  }
};
