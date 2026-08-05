const Patient = require('../models/Patient');
const Consultant = require('../models/Consultant');
const MedicineBatch = require('../models/MedicineBatch');
const MedicineProduct = require('../models/MedicineProduct');
const StockTransaction = require('../models/StockTransaction');
const Sale = require('../models/Sale');
const User = require('../models/User');
const { getClinicDate, formatDateTime, formatCnic } = require('../utils/helpers');
const { hasPermission } = require('../middleware/auth');

exports.index = async (req, res, next) => {
  try {
    const showClinic = hasPermission(req, 'patients.manage');
    const showPharmacy = hasPermission(req, 'inventory.view');
    const showUsers = hasPermission(req, 'users.manage');
    const today = getClinicDate();
    const startOfToday = new Date(`${today}T00:00:00.000Z`);
    const endOfToday = new Date(`${today}T23:59:59.999Z`);
    const now = new Date();
    const nearExpiry = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    let clinic = null;
    let pharmacy = null;
    let userCount = null;
    let medicineEditLogs = [];

    if (showClinic) {
      const [todayPatients, patientRecords, physicians, recentPatients] = await Promise.all([
        Patient.countDocuments({ tokenDate: today }),
        Patient.distinct('mrNumber').then((numbers) => numbers.length),
        Consultant.countDocuments(),
        Patient.find().populate('consultant').sort({ createdAt: -1 }).limit(5).lean()
      ]);
      clinic = { todayPatients, patientRecords, physicians, recentPatients };
    }

    if (showPharmacy) {
      const [
        stockTotals,
        outOfStock,
        expiredBatches,
        nearExpiryBatches,
        todaySalesTotals,
        recentSales,
        pricingConflicts
      ] = await Promise.all([
        MedicineBatch.aggregate([
          { $group: { _id: null, batches: { $sum: 1 }, quantity: { $sum: '$quantity' }, value: { $sum: { $multiply: [{ $divide: ['$quantity', { $ifNull: ['$unitsPerPack', 1] }] }, '$purchasePrice'] } } } }
        ]),
        MedicineBatch.countDocuments({ quantity: { $lte: 0 } }),
        MedicineBatch.countDocuments({ expiryDate: { $lt: now }, quantity: { $gt: 0 } }),
        MedicineBatch.countDocuments({ expiryDate: { $gte: now, $lte: nearExpiry }, quantity: { $gt: 0 } }),
        Sale.aggregate([
          { $match: { createdAt: { $gte: startOfToday, $lte: endOfToday }, status: { $ne: 'VOID' } } },
          { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$grandTotal' } } }
        ]),
        Sale.find({ status: { $ne: 'VOID' } }).sort({ createdAt: -1 }).limit(5).lean(),
        showUsers ? MedicineProduct.find({ pricingStatus: 'CONFLICT' }).sort({ name: 1 }).lean() : []
      ]);
      const conflictBatches = pricingConflicts.length
        ? await MedicineBatch.find({ product: { $in: pricingConflicts.map((product) => product._id) } }).sort({ expiryDate: 1 }).lean()
        : [];
      pharmacy = {
        batches: stockTotals[0]?.batches || 0,
        quantity: stockTotals[0]?.quantity || 0,
        stockValue: stockTotals[0]?.value || 0,
        outOfStock,
        expiredBatches,
        nearExpiryBatches,
        todaySales: todaySalesTotals[0]?.count || 0,
        todayRevenue: todaySalesTotals[0]?.revenue || 0,
        recentSales,
        pricingConflicts: pricingConflicts.map((product) => ({
          ...product,
          batches: conflictBatches.filter((batch) => String(batch.product) === String(product._id))
        }))
      };
    }

    if (showUsers) {
      [userCount, medicineEditLogs] = await Promise.all([
        User.countDocuments({ isActive: true }),
        StockTransaction.find({ type: 'ADJUSTMENT', 'changes.0': { $exists: true } })
          .populate('medicineBatch', 'medicineName batchNumber product')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()
      ]);
    }

    res.render('dashboard', {
      title: 'Dashboard',
      showClinic,
      showPharmacy,
      showUsers,
      clinic,
      pharmacy,
      userCount,
      medicineEditLogs,
      today,
      formatDateTime,
      formatCnic
    });
  } catch (error) {
    next(error);
  }
};
