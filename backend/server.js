const express = require('express');
const bodyParser = require('body-parser');
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

// In-memory database
const users = [
  { id: 1, username: 'admin', password: 'admin123', email: 'admin@test.com', role: 'admin' },
  { id: 2, username: 'ibnu', password: 'ibnu123', email: 'ibnu@test.com', role: 'user' },
  { id: 3, username: 'zaky', password: 'zaky123', email: 'zaky@test.com', role: 'user' },
  { id: 4, username: 'tjokorde', password: 'tjokorde123', email: 'tjokorde@test.com', role: 'user' },
  { id: 5, username: 'agung', password: 'agung123', email: 'agung@test.com', role: 'user' }
];

console.log('✅ Database initialized (in-memory)');

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public', 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'in-memory' });
});

// ⚠️ VULNERABLE: Blind SQL Injection endpoint
app.post('/api/login', (req, res) => {
  try {
    const username = req.body.username;
    const password = req.body.password;

    if (!username || !password) {
      return res.json({ success: false, message: 'Username and password required' });
    }

    // VULNERABLE: String concatenation (simulates SQL injection)
    // Query: SELECT * FROM users WHERE username='${username}' AND password='${password}'
    
    console.log(`🔴 VULNERABLE QUERY: SELECT * FROM users WHERE username='${username}' AND password='${password}'`);
    
    let user = null;

    // SQL Injection detection: ' OR '1'='1
    if (username.includes("' OR '1'='1")) {
      // Auth bypass - matches any user with OR condition
      user = users[0]; // Return admin
    } else if (username.includes("' AND password LIKE")) {
      // Blind SQL extraction with LIKE pattern
      const baseName = username.split("'")[0];
      const likeMatch = username.match(/LIKE '([^']+)'/);
      
      if (likeMatch && baseName === 'admin') {
        const pattern = likeMatch[1];
        const adminUser = users.find(u => u.username === 'admin');
        
        if (adminUser) {
          // Convert SQL LIKE pattern to regex
          // 'a%' -> starts with 'a'
          // 'ad%' -> starts with 'ad'
          const regexPattern = pattern.replace(/%/g, '.*').replace(/_/g, '.');
          const regex = new RegExp('^' + regexPattern + '$');
          
          // Check if password matches the pattern
          if (regex.test(adminUser.password)) {
            user = adminUser; // Pattern matches!
          }
          // else: Pattern doesn't match, user stays null
        }
      }
    } else {
      // Normal login
      user = users.find(u => u.username === username && u.password === password);
    }

    if (user) {
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      };

      const token = jwt.sign(
        { id: user.id, username: user.username, email: user.email, role: user.role },
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

// Register
app.post('/api/register', (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return res.json({ success: false, message: 'All fields required' });
    }

    if (users.find(u => u.username === username)) {
      return res.json({ success: false, message: 'Username already exists' });
    }

    users.push({
      id: users.length + 1,
      username,
      password,
      email,
      role: 'user'
    });

    return res.json({ success: true, message: 'Registration successful' });
  } catch (err) {
    return res.json({ success: false, message: 'Registration failed' });
  }
});

// Dashboard
app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, '../frontend/public', 'dashboard.html'));
});

// Get current user
app.get('/api/current-user', (req, res) => {
  if (!req.session.user) {
    return res.json({ success: false });
  }
  res.json({ success: true, user: req.session.user });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Sample users: admin/admin123, ibnu/ibnu123, zaky/zaky123`);
});
