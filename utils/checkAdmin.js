const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../db/database.sqlite');
console.log('Checking database at:', dbPath);

// Open the database
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to the database.');

    // Query to check users table and find admin users
    db.all(`SELECT id, username, email, is_admin FROM users WHERE is_admin = 1`, [], (err, rows) => {
        if (err) {
            console.error('Error querying database:', err.message);
        } else {
            console.log('Admin users found:', rows.length);
            rows.forEach(row => {
                console.log(`ID: ${row.id}, Username: ${row.username}, Email: ${row.email}, Admin: ${row.is_admin}`);
            });
            
            // Also check all users if no admin found
            if (rows.length === 0) {
                console.log('No admin users found. Checking all users:');
                db.all(`SELECT id, username, email, is_admin FROM users`, [], (err, allRows) => {
                    if (err) {
                        console.error('Error querying all users:', err.message);
                    } else {
                        console.log('Total users found:', allRows.length);
                        allRows.forEach(row => {
                            console.log(`ID: ${row.id}, Username: ${row.username}, Email: ${row.email}, Admin: ${row.is_admin}`);
                        });
                    }
                    db.close();
                });
            } else {
                db.close();
            }
        }
    });
}); 