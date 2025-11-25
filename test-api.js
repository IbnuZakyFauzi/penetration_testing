const http = require('http');

// Simple test
const data = JSON.stringify({
  username: 'admin',
  password: 'admin123'
});

const options = {
  hostname: 'localhost',
  port: 3003,
  path: '/api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  },
  timeout: 5000
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let body = '';
  
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    console.log('BODY:', body);
    try {
      const json = JSON.parse(body);
      console.log('PARSED:', JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Could not parse JSON');
    }
    process.exit(0);
  });
});

req.on('error', (error) => {
  console.error('ERROR:', error.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('TIMEOUT');
  req.destroy();
  process.exit(1);
});

console.log('Sending request...');
req.write(data);
req.end();
