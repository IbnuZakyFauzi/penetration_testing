const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const path = require('path');
const session = require('express-session');
const jwt = require('jsonwebtoken');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// INSECURE: Hardcoded secret key
const JWT_SECRET = 'insecure-secret-key-for-testing';
const JWT_ALGORITHM = 'HS256';

// Session configuration
app.use(session({
  secret: 'blind-sqli-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000 }
}));

// MongoDB connection config
const MONGO_URL = process.env.MONGO_URL || 'mongodb+srv://izakythb_db_user:12345@blindsql.xvz0j3z.mongodb.net/?appName=BlindSQL';
const DB_NAME = 'blind_sqli_db';
const COLLECTION_NAME = 'users';

let db = null;
let usersCollection = null;

const mongoClient = new MongoClient(MONGO_URL, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  retryWrites: true,
  w: 'majority'
});

async function connectDB() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoClient.connect();
    db = mongoClient.db(DB_NAME);
    usersCollection = db.collection(COLLECTION_NAME);
    
    await usersCollection.createIndex({ username: 1 }, { unique: true });
    console.log('✅ Connected to MongoDB');
    
    // Initialize sample data
    const count = await usersCollection.countDocuments();
    if (count === 0) {
      console.log('📝 Inserting sample users...');
      const sampleUsers = [
        { username: 'admin', password: 'admin123', email: 'admin@test.com', role: 'admin' },
        { username: 'ibnu', password: 'ibnu123', email: 'ibnu@test.com', role: 'user' },
        { username: 'zaky', password: 'zaky123', email: 'zaky@test.com', role: 'user' },
        { username: 'tjokorde', password: 'tjokorde123', email: 'tjokorde@test.com', role: 'user' },
        { username: 'agung', password: 'agung123', email: 'agung@test.com', role: 'user' }
      ];
      await usersCollection.insertMany(sampleUsers);
      console.log('✅ Sample users added');
    }
  } catch (err) {
    console.error('❌ MongoDB Error:', err.message);
    throw err;
  }
}

// Middleware: Check database connection
app.use((req, res, next) => {
  if (!usersCollection) {
    return res.status(503).json({ success: false, message: 'Database not connected' });
  }
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public', 'index.html'));
});

// Dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public', 'dashboard.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', database: usersCollection ? 'connected' : 'disconnected' });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.json({ success: false, message: 'Username and password required' });
    }

    // VULNERABLE: Direct query construction
    const user = await usersCollection.findOne({ username: username, password: password });

    if (user) {
      req.session.user = {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      };

      const token = jwt.sign(
        {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        JWT_SECRET,
        { algorithm: JWT_ALGORITHM }
      );

      return res.json({
        success: true,
        message: 'Login successful',
        user: user.username,
        token: token
      });
    }

    res.json({ success: false, message: 'Invalid credentials' });
  } catch (err) {
    console.error('Login Error:', err.message);
    res.json({ success: false, message: 'Login failed' });
  }
});

// Search endpoint
app.post('/api/search', async (req, res) => {
  try {
    const searchTerm = req.body.query || req.body.search || '';

    if (!searchTerm) {
      return res.json({ success: false, message: 'Search query required', results: [] });
    }

    // VULNERABLE: Using regex with unsanitized input
    const query = { $or: [{ username: { $regex: searchTerm } }, { email: { $regex: searchTerm } }] };
    const results = await usersCollection.find(query).project({ username: 1, email: 1 }).toArray();

    res.json({ success: true, results: results });
  } catch (err) {
    console.error('Search Error:', err.message);
    res.json({ success: false, message: 'Search failed' });
  }
});

// Get user by username
app.get('/api/user/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const user = await usersCollection.findOne({ username: username });

    if (user) {
      res.json({ success: true, user: { id: user._id, username: user.username, email: user.email, role: user.role } });
    } else {
      res.json({ success: false, message: 'User not found' });
    }
  } catch (err) {
    console.error('Get User Error:', err.message);
    res.json({ success: false, message: 'Failed to get user' });
  }
});

// Register endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return res.json({ success: false, message: 'All fields required' });
    }

    const result = await usersCollection.insertOne({
      username: username,
      password: password,
      email: email,
      role: 'user'
    });

    res.json({ success: true, message: 'Registration successful', userId: result.insertedId });
  } catch (err) {
    if (err.message.includes('duplicate key')) {
      res.json({ success: false, message: 'Username or email already exists' });
    } else {
      console.error('Register Error:', err.message);
      res.json({ success: false, message: 'Registration failed' });
    }
  }
});

// Get user session
app.get('/api/user-session', (req, res) => {
  if (req.session.user) {
    res.json({ success: true, user: req.session.user });
  } else {
    res.json({ success: false });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await usersCollection.find({}).project({ username: 1, email: 1, role: 1 }).toArray();
    res.json({ success: true, users: users });
  } catch (err) {
    console.error('Get Users Error:', err.message);
    res.json({ success: false, message: 'Failed to fetch users' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: 'Logged out' });
});

// Start server
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n📍 Shutting down...');
  await mongoClient.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n📍 Shutting down...');
  await mongoClient.close();
  process.exit(0);
});
