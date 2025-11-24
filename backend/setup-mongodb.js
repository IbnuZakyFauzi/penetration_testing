const { MongoClient } = require('mongodb');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = 'blind_sqli_db';
const USERS_COLLECTION = 'users';

async function setupMongoDB() {
  const client = new MongoClient(MONGO_URL);

  try {
    await client.connect();
    console.log('✓ Connected to MongoDB');

    const db = client.db(DB_NAME);
    console.log(`✓ Using database: ${DB_NAME}`);

    // Drop existing collection if exists (for fresh setup)
    const collections = await db.listCollections().toArray();
    if (collections.some(c => c.name === USERS_COLLECTION)) {
      await db.collection(USERS_COLLECTION).drop();
      console.log(`✓ Dropped existing ${USERS_COLLECTION} collection`);
    }

    // Create users collection
    await db.createCollection(USERS_COLLECTION);
    console.log(`✓ Created ${USERS_COLLECTION} collection`);

    // Create indexes for unique fields
    const usersCollection = db.collection(USERS_COLLECTION);
    await usersCollection.createIndex({ username: 1 }, { unique: true });
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    console.log('✓ Created unique indexes for username and email');

    // Insert sample data
    const sampleUsers = [
      {
        username: 'admin',
        password: 'admin123',
        email: 'admin@test.com',
        role: 'admin',
        created_at: new Date()
      },
      {
        username: 'ibnu',
        password: 'ibnu123',
        email: 'ibnu@test.com',
        role: 'user',
        created_at: new Date()
      },
      {
        username: 'zaky',
        password: 'zaky123',
        email: 'zaky@test.com',
        role: 'user',
        created_at: new Date()
      },
      {
        username: 'tjokorde',
        password: 'tjokorde123',
        email: 'tjokorde@test.com',
        role: 'user',
        created_at: new Date()
      },
      {
        username: 'agung',
        password: 'agung123',
        email: 'agung@test.com',
        role: 'user',
        created_at: new Date()
      }
    ];

    const result = await usersCollection.insertMany(sampleUsers);
    console.log(`✓ Inserted ${result.insertedCount} sample users`);

    console.log('\n✅ MongoDB setup completed successfully!');
    console.log('\nSample users created:');
    sampleUsers.forEach(user => {
      console.log(`  - ${user.username} / ${user.password} (${user.email})`);
    });

    console.log('\n📝 Connection string:');
    console.log(`  ${MONGO_URL}/${DB_NAME}`);

  } catch (error) {
    console.error('❌ Error setting up MongoDB:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✓ MongoDB connection closed');
  }
}

setupMongoDB();
