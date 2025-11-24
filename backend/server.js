const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const session = require('express-session');
const jwt = require('jsonwebtoken');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// INSECURE: Hardcoded secret key (vulnerable to token forgery)
const JWT_SECRET = 'insecure-secret-key-for-testing'; // INSECURE!
const JWT_ALGORITHM = 'HS256'; // Default but weak

// Session configuration
app.use(session({
  secret: 'blind-sqli-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000 }
}));

// MongoDB connection
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = 'blind_sqli_db';
const USERS_COLLECTION = 'users';

let db = null;
let usersCollection = null;

const mongoClient = new MongoClient(MONGO_URL);

mongoClient.connect().then(() => {
  db = mongoClient.db(DB_NAME);
  usersCollection = db.collection(USERS_COLLECTION);
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('Error connecting to MongoDB:', err);
  process.exit(1);
});

// Serve static files
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public', 'index.html'));
});

// Vulnerable login endpoint - BLIND NOSQL INJECTION
app.post('/api/login', async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  // VULNERABLE: Direct template string concatenation creating NoSQL injection
  // This simulates SQL injection patterns but with MongoDB queries
  try {
    // VULNERABLE: Building query with unsanitized input
    // In real NoSQL injection, attacker could inject: {"$ne": ""} or similar operators
    const query = {
      username: new Function('return ' + `"${username.replace(/"/g, '\\"')}"`)(),
      password: new Function('return ' + `"${password.replace(/"/g, '\\"')}"`)()
    };
    
    // Simpler vulnerable approach: direct query construction
    let vulnerableQuery = {};
    try {
      // Attempt to evaluate input as JavaScript object (NoSQL injection)
      if (username.includes('{') || username.includes('[')) {
        vulnerableQuery = JSON.parse(username);
      } else {
        vulnerableQuery.username = username;
      }
    } catch (e) {
      vulnerableQuery.username = username;
    }
    
    vulnerableQuery.password = password;
    
    const user = await usersCollection.findOne(vulnerableQuery);
    
    if (user) {
      // Store user in session
      req.session.user = {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        role: user.role
      };
      
      // INSECURE: Generate JWT without expiration (vulnerable)
      const token = jwt.sign(
        {
          id: user._id.toString(),
          username: user.username,
          email: user.email,
          role: user.role
        },
        JWT_SECRET,
        { algorithm: JWT_ALGORITHM }
        // INSECURE: No expiresIn option - token never expires!
      );
      
      res.json({ 
        success: true, 
        message: 'Login successful',
        user: user.username,
        token: token // Return JWT to client
      });
    } else {
      res.json({ success: false, message: 'Login failed' });
    }
  } catch (err) {
    // No error message shown to user - BLIND
    console.error('Query Error:', err);
    res.json({ success: false, message: 'Login failed' });
  }
});

// Vulnerable user search endpoint - BLIND NOSQL INJECTION
app.post('/api/search', async (req, res) => {
  const searchTerm = req.body.search;

  try {
    // VULNERABLE: Using regex pattern with unsanitized input
    // Attacker could inject regex patterns to bypass search
    let query = {};
    
    // VULNERABLE: Direct regex construction
    if (searchTerm.includes('(') || searchTerm.includes(')') || searchTerm.includes('|')) {
      // If contains regex chars, try to use as regex pattern
      try {
        const pattern = new RegExp(searchTerm, 'i');
        query = {
          $or: [
            { username: pattern },
            { email: pattern }
          ]
        };
      } catch (e) {
        // Fallback to string search
        query = {
          $or: [
            { username: { $regex: searchTerm, $options: 'i' } },
            { email: { $regex: searchTerm, $options: 'i' } }
          ]
        };
      }
    } else {
      query = {
        $or: [
          { username: { $regex: searchTerm, $options: 'i' } },
          { email: { $regex: searchTerm, $options: 'i' } }
        ]
      };
    }
    
    const results = await usersCollection.find(query).toArray();
    
    res.json({ 
      success: true, 
      results: results.map(u => ({
        id: u._id.toString(),
        username: u.username,
        email: u.email
      })),
      count: results.length
    });
  } catch (err) {
    // No error message shown to user - BLIND
    console.error('Query Error:', err);
    res.json({ success: false, results: [], count: 0 });
  }
});

// Vulnerable user profile endpoint - BLIND NOSQL INJECTION
app.get('/api/user/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    // VULNERABLE: Direct ID matching without type validation
    let query = {};
    
    // VULNERABLE: Trying to parse userId as potential injection
    try {
      // Could be injected with operators like {"$ne": null}
      if (userId.includes('{') || userId.includes('[')) {
        query = JSON.parse(userId);
      } else if (ObjectId.isValid(userId)) {
        query = { _id: new ObjectId(userId) };
      } else {
        query = { _id: userId };
      }
    } catch (e) {
      if (ObjectId.isValid(userId)) {
        query = { _id: new ObjectId(userId) };
      } else {
        query = { _id: userId };
      }
    }
    
    const user = await usersCollection.findOne(query);
    
    if (user) {
      res.json({ 
        success: true, 
        user: {
          id: user._id.toString(),
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } else {
      res.json({ success: false });
    }
  } catch (err) {
    // No error message shown to user
    console.error('Query Error:', err);
    res.json({ success: false });
  }
});

// Vulnerable register endpoint - BLIND NOSQL INJECTION
app.post('/api/register', async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const email = req.body.email;

  try {
    // VULNERABLE: Direct insertion without sanitization
    const newUser = {
      username: username,
      password: password,
      email: email,
      role: 'user',
      created_at: new Date()
    };
    
    // Check for existing username or email (but this check itself is vulnerable to injection)
    const existingUser = await usersCollection.findOne({
      $or: [
        { username: username },
        { email: email }
      ]
    });
    
    if (existingUser) {
      res.json({ success: false, message: 'Username or email already exists' });
      return;
    }
    
    // VULNERABLE: Direct insert with unsanitized data
    const result = await usersCollection.insertOne(newUser);
    
    res.json({ 
      success: true, 
      message: 'Registration successful. Please login.'
    });
  } catch (err) {
    console.error('Query Error:', err);
    res.json({ success: false, message: 'Registration failed' });
  }
});

// Dashboard page - Requires login
app.get('/dashboard', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, '../frontend/public', 'dashboard.html'));
});

// SQL Injection Tester page - Requires login
app.get('/tester', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, '../frontend/public', 'tester.html'));
});

// Get current user session
app.get('/api/current-user', (req, res) => {
  if (!req.session.user) {
    res.json({ success: false });
    return;
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
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nClosing MongoDB connection...');
  await mongoClient.close();
  process.exit(0);
});
