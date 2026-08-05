function getClinicDate(date = new Date()) {
  const timezone = process.env.CLINIC_TIMEZONE || 'Asia/Karachi';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat('en-PK', {
    timeZone: process.env.CLINIC_TIMEZONE || 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(date));
}

function formatClinicTime(date) {
  return new Intl.DateTimeFormat('en-PK', {
    timeZone: process.env.CLINIC_TIMEZONE || 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
}

function formatClinicDisplayDate(date) {
  return new Intl.DateTimeFormat('en-PK', {
    timeZone: process.env.CLINIC_TIMEZONE || 'Asia/Karachi',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(date));
}

function normalizeCnic(value = '') {
  return String(value).replace(/\D/g, '');
}

function formatCnic(value = '') {
  const digits = normalizeCnic(value);
  if (digits.length !== 13) return value;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatToken(value) {
  return String(value).padStart(3, '0');
}

module.exports = {
  getClinicDate,
  formatDateTime,
  formatClinicTime,
  formatClinicDisplayDate,
  normalizeCnic,
  formatCnic,
  escapeRegex,
  formatToken
};
