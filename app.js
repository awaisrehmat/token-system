require('dotenv').config();

const express = require('express');
const path = require('path');
const connectDatabase = require('./config/database');
const patientRoutes = require('./routes/patientRoutes');
const consultantRoutes = require('./routes/consultantRoutes');
const { dashboard } = require('./controllers/patientController');

const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.locals.clinicName = process.env.CLINIC_NAME || 'My Clinic';
  res.locals.currentPath = req.path;
  res.locals.message = req.query.message || '';
  res.locals.errorMessage = req.query.error || '';
  res.locals.query = req.query;
  next();
});

app.get('/', dashboard);
app.use('/patients', patientRoutes);
app.use('/consultants', consultantRoutes);

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'The page you requested could not be found.'
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).render('error', {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again.'
  });
});

async function startServer() {
  await connectDatabase();
  app.listen(port, () => {
    console.log(`Doctor Token System running at http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Unable to start the application:', error.message);
    process.exit(1);
  });
}

module.exports = app;
