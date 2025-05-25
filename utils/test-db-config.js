#!/usr/bin/env node

/**
 * Test script to verify database configuration
 * Tests both local development and persistent disk setups
 */

const dbConfig = require('../config/database-config');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

console.log('🧪 Testing Database Configuration\n');

// Display current configuration
dbConfig.logConfig();

console.log('\n📋 Configuration Details:');
console.log(`   Database file: ${dbConfig.getDatabasePath()}`);
console.log(`   Session directory: ${dbConfig.getSessionPath()}`);
console.log(`   Session file: ${dbConfig.getSessionDatabase()}`);

// Test database connectivity
console.log('\n🔗 Testing Database Connection...');

const dbPath = dbConfig.getDatabasePath();

try {
    // Check if database file exists
    const dbExists = fs.existsSync(dbPath);
    console.log(`   Database exists: ${dbExists ? '✅ Yes' : '❌ No'}`);

    // Test connection
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('   Connection: ❌ FAILED');
            console.error(`   Error: ${err.message}`);
            process.exit(1);
        } else {
            console.log('   Connection: ✅ SUCCESS');

            // Test a simple query
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
                if (err) {
                    console.error('   Query test: ❌ FAILED');
                    console.error(`   Error: ${err.message}`);
                } else if (row) {
                    console.log('   Users table: ✅ EXISTS');
                    
                    // Count users
                    db.get("SELECT COUNT(*) as count FROM users", (err, countRow) => {
                        if (err) {
                            console.error('   User count: ❌ FAILED');
                        } else {
                            console.log(`   Total users: ${countRow.count}`);
                        }
                        
                        console.log('\n🎉 Database configuration test completed successfully!');
                        console.log('\n💡 Tips:');
                        console.log('   - For local development: Leave DB_PATH empty in .env');
                        console.log('   - For Render deployment: Set DB_PATH=/data (or your mount path)');
                        console.log('   - Data will persist across deployments when using persistent disk');
                        
                        db.close();
                    });
                } else {
                    console.log('   Users table: ❌ NOT FOUND (database may need initialization)');
                    console.log('\n💡 To initialize the database, start the main application once.');
                    db.close();
                }
            });
        }
    });

} catch (error) {
    console.error('   Test failed:', error.message);
    process.exit(1);
} 