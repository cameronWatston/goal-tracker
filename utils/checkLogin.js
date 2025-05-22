const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, '../db/database.sqlite');
console.log('Checking database at:', dbPath);

// Test login credentials
const testEmail = 'cameronawatson456@gmail.com';
const testPassword = '3124';

// Open the database
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, async (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to the database.');

    try {
        // Get user by email
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE email = ?', [testEmail], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!user) {
            console.error('User not found with email:', testEmail);
            process.exit(1);
        }

        console.log('User found:', {
            id: user.id,
            username: user.username,
            email: user.email,
            is_admin: user.is_admin,
            is_verified: user.is_verified
        });

        // Check password
        const isMatch = await bcrypt.compare(testPassword, user.password);
        if (isMatch) {
            console.log('Password match: SUCCESS - Login should work!');
        } else {
            console.log('Password match: FAILED - Password is incorrect');
        }
    } catch (error) {
        console.error('Error testing login:', error);
    } finally {
        db.close();
    }
}); 