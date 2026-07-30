require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const connectDatabase = require('./config/database');
const PrintSetting = require('./models/PrintSetting');
const patientRoutes = require('./routes/patientRoutes');
const consultantRoutes = require('./routes/consultantRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const { dashboard } = require('./controllers/patientController');
const { requireAuth, showLogin, login, logout } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('trust proxy', 1);

const sessionOptions = {
  name: 'doctor_token_session',
  secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
};

if (process.env.MONGODB_URI) {
  sessionOptions.store = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 60 * 60 * 8
  });
}

app.use(session(sessionOptions));

app.use((req, res, next) => {
  res.locals.clinicName = 'My Clinic';
  res.locals.currentPath = req.path;
  res.locals.message = req.query.message || '';
  res.locals.errorMessage = req.query.error || '';
  res.locals.query = req.query;
  res.locals.currentUser = req.session?.username || '';
  next();
});

// Vercel imports this Express app instead of running app.js as the main
// process. Connecting per request with a cached promise supports both Vercel
// serverless instances and the normal local server.
app.use(async (req, res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

// The receipt header is the shared clinic name throughout the interface.
app.use(async (req, res, next) => {
  try {
    const printSetting = await PrintSetting.findOne({ key: 'default' }).select('header').lean();
    if (printSetting?.header) res.locals.clinicName = printSetting.header;
    next();
  } catch (error) {
    next(error);
  }
});

app.get('/login', showLogin);
app.post('/login', login);
app.use(requireAuth);
app.post('/logout', logout);
app.get('/', dashboard);
app.use('/patients', patientRoutes);
app.use('/consultants', consultantRoutes);
app.use('/inventory', inventoryRoutes);

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    pageMessage: 'The page you requested could not be found.'
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).render('error', {
    title: 'Something Went Wrong',
    pageMessage: process.env.NODE_ENV === 'production'
      ? 'The application could not connect to its service. Please check the deployment configuration and try again.'
      : error.message
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
