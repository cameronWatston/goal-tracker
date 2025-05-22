const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const readline = require('readline');

const dbPath = path.join(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

// Handle database closing properly
let dbClosed = false;

function closeDatabase() {
    if (!dbClosed) {
        dbClosed = true;
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('Database connection closed successfully');
            }
        });
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Prompt for admin credentials
console.log('Create Admin User\n------------------');

rl.question('Username: ', (username) => {
    rl.question('Email: ', (email) => {
        rl.question('Password: ', async (password) => {
            try {
                // Check if user already exists
                const existingUser = await new Promise((resolve, reject) => {
                    db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, email], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });

                if (existingUser) {
                    if (existingUser.username === username) {
                        console.error('Error: Username already exists');
                    } else {
                        console.error('Error: Email already exists');
                    }
                    rl.close();
                    closeDatabase();
                    return;
                }

                // Hash password
                const hashedPassword = await bcrypt.hash(password, 10);

                // Create new admin user
                await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO users (username, email, password, is_verified, is_admin, created_at) VALUES (?, ?, ?, 1, 1, CURRENT_TIMESTAMP)',
                        [username, email, hashedPassword],
                        function (err) {
                            if (err) reject(err);
                            else resolve(this.lastID);
                        }
                    );
                });

                console.log(`\nAdmin user ${username} created successfully!`);
                console.log('You can now log in with these credentials.');
            } catch (error) {
                console.error('Error creating admin user:', error);
            } finally {
                rl.close();
                closeDatabase();
            }
        });
    });
});

// Handle Ctrl+C
rl.on('SIGINT', () => {
    console.log('\nOperation cancelled');
    rl.close();
    closeDatabase();
    process.exit(0);
}); 