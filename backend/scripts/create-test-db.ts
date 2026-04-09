/**
 * Create test database using existing Prisma/Node.js pg connection
 * This bypasses psql command-line authentication issues
 */

import { config } from 'dotenv';
import { Client } from 'pg';
import * as path from 'path';

// Load environment variables
config({ path: path.join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL!;

async function createTestDatabase() {
  console.log('=== Creating Test Database via Node.js pg ===\n');

  // Connect to default postgres database to create new database
  const url = new URL(DATABASE_URL);
  const adminClient = new Client({
    host: url.hostname,
    port: parseInt(url.port || '5432'),
    user: url.username,
    password: url.password,
    database: 'postgres', // Connect to postgres database to create others
  });

  try {
    console.log('Connecting to PostgreSQL...');
    console.log(`Host: ${url.hostname}:${url.port}`);
    console.log(`User: ${url.username}\n`);

    await adminClient.connect();
    console.log('✓ Connected successfully\n');

    // Create test database
    console.log('Creating test database and user...');

    try {
      await adminClient.query('CREATE DATABASE testdb;');
      console.log('✓ Database "testdb" created');
    } catch (e: any) {
      if (e.code === '42P04') {
        console.log('⚠ Database "testdb" already exists');
      } else {
        throw e;
      }
    }

    try {
      await adminClient.query("CREATE USER testuser WITH PASSWORD 'test';");
      console.log('✓ User "testuser" created');
    } catch (e: any) {
      if (e.code === '42710') {
        console.log('⚠ User "testuser" already exists');
      } else {
        throw e;
      }
    }

    try {
      await adminClient.query('GRANT ALL PRIVILEGES ON DATABASE testdb TO testuser;');
      console.log('✓ Privileges granted to testuser');
    } catch (e: any) {
      console.log(`⚠ Could not grant privileges: ${e.message}`);
    }

    await adminClient.end();

    // Now connect to testdb to grant schema privileges
    const testClient = new Client({
      host: url.hostname,
      port: parseInt(url.port || '5432'),
      user: url.username,
      password: url.password,
      database: 'testdb',
    });

    await testClient.connect();
    await testClient.query('GRANT ALL ON SCHEMA public TO testuser;');
    await testClient.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO testuser;');
    await testClient.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO testuser;');
    console.log('✓ Schema privileges granted\n');

    // Create some test tables
    console.log('Creating test tables...');
    await testClient.query(`
      CREATE TABLE IF NOT EXISTS test_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        email VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await testClient.query(`
      CREATE TABLE IF NOT EXISTS test_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES test_users(id),
        account_number VARCHAR(20),
        balance DECIMAL(10,2) DEFAULT 0
      );
    `);

    await testClient.query(`
      INSERT INTO test_users (username, email) VALUES
        ('demo_user1', 'demo1@example.com'),
        ('demo_user2', 'demo2@example.com'),
        ('demo_user3', 'demo3@example.com');
    `);

    await testClient.query(`
      INSERT INTO test_accounts (user_id, account_number, balance) VALUES
        (1, 'TEST001', 1000.00),
        (2, 'TEST002', 2500.00),
        (3, 'TEST003', 500.00);
    `);

    console.log('✓ Test tables and data created\n');

    // Verify
    const result = await testClient.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
    `);

    console.log('Tables in testdb:');
    result.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });

    const countResult = await testClient.query(`
      SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';
    `);

    console.log(`\nTotal tables: ${countResult.rows[0].count}`);

    await testClient.end();

    console.log('\n✓ Test database setup complete!');
    console.log('\nVerification command:');
    console.log('PGPASSWORD=test psql -h localhost -U testuser testdb -c "\\dt"');

    return true;
  } catch (error) {
    console.error('\n✗ Error:', error);
    if (adminClient) {
      await adminClient.end().catch(() => {});
    }
    return false;
  }
}

createTestDatabase()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
