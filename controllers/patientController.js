const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const Consultant = require('../models/Consultant');
const DailyCounter = require('../models/DailyCounter');
const MedicalRecordCounter = require('../models/MedicalRecordCounter');
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

async function nextMrNumber(year) {
  let counter;
  try {
    counter = await MedicalRecordCounter.findOneAndUpdate(
      { year },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    counter = await MedicalRecordCounter.findOneAndUpdate(
      { year },
      { $inc: { sequence: 1 } },
      { new: true }
    );
  }
  return `MR-${year}-${String(counter.sequence).padStart(6, '0')}`;
}

function patientValues(body = {}) {
  return {
    patientName: String(body.patientName || '').trim(),
    relationType: String(body.relationType || '').trim().toUpperCase(),
    relativeName: String(body.relativeName || '').trim(),
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
  if (!['S/O', 'W/O', 'D/O'].includes(data.relationType)) errors.push('Please select S/O, W/O, or D/O.');
  if (!data.relativeName) errors.push('Father or husband name is required.');
  if (data.age === '' || Number.isNaN(Number(data.age)) || Number(data.age) < 0 || Number(data.age) > 130) {
    errors.push('Age must be between 0 and 130.');
  }
  if (!['Male', 'Female', 'Other'].includes(data.sex)) errors.push('Please select a valid sex.');
  if (!/^\d{13}$/.test(data.cnic)) errors.push('CNIC must contain exactly 13 digits.');
  if (!data.contactNumber) errors.push('Contact number is required.');
  if (!data.address) errors.push('Address is required.');
  if (!mongoose.isValidObjectId(data.consultant)) errors.push('Please select a physician.');
  if (!data.patientType) errors.push('Patient type is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.tokenDate || '')) errors.push('A valid date is required.');
  return errors;
}

async function nextToken(date, physician) {
  try {
    const counter = await DailyCounter.findOneAndUpdate(
      { date, physician },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return formatToken(counter.sequence);
  } catch (error) {
    // Two first requests can race while creating today's counter. The unique date
    // index lets one win; the other safely retries against the created document.
    if (error.code === 11000) {
      const counter = await DailyCounter.findOneAndUpdate(
        { date, physician },
        { $inc: { sequence: 1 } },
        { new: true }
      );
      return formatToken(counter.sequence);
    }
    throw error;
  }
}

async function availableGeneratedToken(date, physician) {
  let token;
  let exists;
  do {
    token = await nextToken(date, physician);
    exists = await Patient.exists({ tokenDate: date, consultant: physician, tokenNumber: token });
  } while (exists);
  return token;
}

exports.dashboard = async (req, res, next) => {
  try {
    const today = getClinicDate();
    const [todayTotal, recentPatients] = await Promise.all([
      Patient.countDocuments({ tokenDate: today }),
      Patient.find().populate('consultant').sort({ createdAt: -1 }).limit(5).lean()
    ]);

    res.render('dashboard', {
      title: 'Dashboard',
      todayTotal,
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
        { mrNumber: { $regex: safeSearch, $options: 'i' } },
        { patientName: { $regex: safeSearch, $options: 'i' } },
        { relativeName: { $regex: safeSearch, $options: 'i' } },
        { contactNumber: { $regex: safeSearch, $options: 'i' } },
        { tokenNumber: { $regex: safeSearch, $options: 'i' } },
        { address: { $regex: safeSearch, $options: 'i' } },
        { consultant: { $in: consultantIds } }
      ];
      if (cnicDigits) query.$or.push({ cnic: { $regex: escapeRegex(cnicDigits) } });
    }

    const [patients, total, consultants] = await Promise.all([
      Patient.find(query)
        .populate('consultant')
        .sort({ tokenDate: -1, createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      Patient.countDocuments(query),
      Consultant.find().sort({ name: 1 }).lean()
    ]);

    res.render('patients/index', {
      title: 'Patient List',
      patients,
      search,
      date,
      page,
      totalPages: Math.max(Math.ceil(total / PAGE_SIZE), 1),
      total,
      pageSize: PAGE_SIZE,
      consultants,
      formatCnic
    });
  } catch (error) {
    next(error);
  }
};

exports.history = async (req, res, next) => {
  try {
    const selectedPatient = await Patient.findById(req.params.id).lean();
    if (!selectedPatient) {
      return res.status(404).render('error', { title: 'Patient Not Found', pageMessage: 'Patient record not found.' });
    }

    const [visits, consultants] = await Promise.all([
      Patient.find({ mrNumber: selectedPatient.mrNumber })
        .populate('consultant')
        .sort({ createdAt: -1 })
        .lean(),
      Consultant.find().sort({ name: 1 }).lean()
    ]);

    return res.render('patients/history', {
      title: `History ${selectedPatient.mrNumber}`,
      patient: visits[0] || selectedPatient,
      visits,
      consultants,
      formatCnic,
      formatDateTime
    });
  } catch (error) {
    return next(error);
  }
};

exports.revisit = async (req, res, next) => {
  try {
    const selectedVisit = await Patient.findById(req.params.id).lean();
    if (!selectedVisit) {
      return res.status(404).render('error', { title: 'Patient Not Found', pageMessage: 'Patient record not found.' });
    }
    const previousVisit = await Patient.findOne({ mrNumber: selectedVisit.mrNumber })
      .sort({ createdAt: -1 })
      .lean();

    const physician = req.body.consultant;
    if (!mongoose.isValidObjectId(physician) || !(await Consultant.exists({ _id: physician }))) {
      return res.redirect(`/patients/${req.params.id}/history?error=${encodeURIComponent('Please select a valid physician.')}`);
    }

    const tokenDate = getClinicDate();
    const tokenNumber = await availableGeneratedToken(tokenDate, physician);
    const visit = await Patient.create({
      mrNumber: previousVisit.mrNumber,
      patientName: previousVisit.patientName,
      relationType: previousVisit.relationType || '',
      relativeName: previousVisit.relativeName || '',
      age: previousVisit.age,
      sex: previousVisit.sex,
      cnic: previousVisit.cnic,
      contactNumber: previousVisit.contactNumber,
      address: previousVisit.address,
      consultant: physician,
      patientType: String(req.body.patientType || 'Follow-up').trim() || 'Follow-up',
      description: String(req.body.description || '').trim(),
      tokenNumber,
      tokenDate
    });

    return res.redirect(`/patients/${visit._id}/token?print=1&message=${encodeURIComponent('Follow-up token generated successfully.')}`);
  } catch (error) {
    if (error.code === 11000) {
      return res.redirect(`/patients/${req.params.id}/history?error=${encodeURIComponent('A token conflict occurred. Please try again.')}`);
    }
    return next(error);
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
    if (!consultantExists) errors.push('The selected physician no longer exists.');

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

    data.mrNumber = await nextMrNumber(Number(data.tokenDate.slice(0, 4)));
    data.tokenNumber = await availableGeneratedToken(data.tokenDate, data.consultant);

    const patient = await Patient.create(data);
    return res.redirect(`/patients/${patient._id}/token?message=${encodeURIComponent('Patient registered successfully.')}`);
  } catch (error) {
    if (error.code === 11000) {
      const consultants = await Consultant.find().sort({ name: 1 }).lean();
      const conflictMessage = error.keyPattern?.mrNumber
        ? 'An MR-number conflict occurred. Please submit the form again.'
        : 'A token-number conflict occurred. Please submit the form again to generate a new token.';
      return res.status(409).render('patients/form', {
        title: 'Register Patient',
        patient: data,
        consultants,
        errors: [conflictMessage],
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
    if (!patient) return res.status(404).render('error', { title: 'Patient Not Found', pageMessage: 'Patient record not found.' });

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
    const existingPatient = await Patient.findById(req.params.id).select('tokenNumber mrNumber').lean();
    if (!existingPatient) {
      return res.status(404).render('error', { title: 'Patient Not Found', pageMessage: 'Patient record not found.' });
    }
    data.tokenNumber = existingPatient.tokenNumber;
    data.mrNumber = existingPatient.mrNumber;

    const errors = validatePatient(data);
    const consultantExists = mongoose.isValidObjectId(data.consultant)
      ? await Consultant.exists({ _id: data.consultant })
      : false;
    if (!consultantExists) errors.push('The selected physician no longer exists.');

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
    if (!patient) return res.status(404).render('error', { title: 'Patient Not Found', pageMessage: 'Patient record not found.' });
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
    if (!patient) return res.status(404).render('error', { title: 'Patient Not Found', pageMessage: 'Patient record not found.' });
    const printSetting = savedPrintSetting || {
      header: 'My Clinic',
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
