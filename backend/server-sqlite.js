const express = require('express');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');
const path = require('path');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// INSECURE: Hardcoded secret key (vulnerable to token forgery)
const JWT_SECRET = 'insecure-secret-key-for-testing';
const JWT_ALGORITHM = 'HS256';

// Session configuration
app.use(session({
  secret: 'blind-sqli-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000 }
}));

// Initialize SQLite database
const dataDir = path.join(__dirname, '..', '.data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'blind-sqli.db');
const db = new Database(dbPath);

console.log('✅ SQLite database initialized at:', dbPath);

// Create users table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'user'
  )
`);

// Initialize sample data if table is empty
const count = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (count.count === 0) {
  console.log('Inserting sample users...');
  const sampleUsers = [
    { username: 'admin', password: 'admin123', email: 'admin@test.com', role: 'admin' },
    { username: 'ibnu', password: 'ibnu123', email: 'ibnu@test.com', role: 'user' },
    { username: 'zaky', password: 'zaky123', email: 'zaky@test.com', role: 'user' },
    { username: 'tjokorde', password: 'tjokorde123', email: 'tjokorde@test.com', role: 'user' },
    { username: 'agung', password: 'agung123', email: 'agung@test.com', role: 'user' }
  ];

  const insertStmt = db.prepare(
    'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)'
  );

  for (const user of sampleUsers) {
    insertStmt.run(user.username, user.password, user.email, user.role);
  }
  console.log('✅ Sample users inserted');
}

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: 'sqlite',
    timestamp: new Date().toISOString()
  });
});

// Vulnerable login endpoint - BLIND SQL INJECTION
app.post('/api/login', (req, res) => {
  try {
    const username = req.body.username;
    const password = req.body.password;

    if (!username || !password) {
      return res.json({ success: false, message: 'Username and password required' });
    }

    // ⚠️ VULNERABLE: Direct string concatenation (ALLOWS SQL INJECTION)
    // This allows attackers to inject SQL operators like: admin' OR '1'='1
    const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
    console.log('🔴 VULNERABLE QUERY:', query); // Log for demo only
    const user = db.prepare(query).get();

    if (user) {
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      };

      const token = jwt.sign(
        {
          id: user.id,
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
    } else {
      return res.json({ success: false, message: 'Login failed' });
    }
  } catch (err) {
    console.error('Login Error:', err.message);
    return res.json({ success: false, message: 'Login failed' });
  }
});

// Vulnerable search endpoint
app.post('/api/search', (req, res) => {
  try {
    const searchTerm = req.body.query || req.body.search || '';

    if (!searchTerm) {
      return res.json({ success: false, message: 'Search query required', results: [] });
    }

    // VULNERABLE: Using LIKE with unsanitized input
    const query = `SELECT username, email FROM users WHERE username LIKE ? OR email LIKE ?`;
    const pattern = `%${searchTerm}%`;
    const results = db.prepare(query).all(pattern, pattern);

    res.json({ success: true, results: results });
  } catch (err) {
    console.error('Search Error:', err.message);
    res.json({ success: false, message: 'Search failed' });
  }
});

// Get user by username
app.get('/api/user/:username', (req, res) => {
  try {
    const username = req.params.username;
    const query = `SELECT id, username, email, role FROM users WHERE username = ?`;
    const user = db.prepare(query).get(username);

    if (user) {
      res.json({ success: true, user: user });
    } else {
      res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (err) {
    console.error('User Lookup Error:', err.message);
    res.json({ success: false, message: 'Error fetching user' });
  }
});

// Register endpoint
app.post('/api/register', (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return res.json({ success: false, message: 'All fields required' });
    }

    const insertQuery = `INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, 'user')`;
    const result = db.prepare(insertQuery).run(username, password, email);

    res.json({ success: true, message: 'Registration successful', userId: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
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

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nClosing SQLite connection...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nClosing SQLite connection...');
  db.close();
  process.exit(0);
});
