const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'db', 'database.sqlite');

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    console.log('Connected to database');
});

// Get email from command line argument
const email = process.argv[2];

if (!email) {
    console.error('Please provide an email address');
    console.log('Usage: node create-admin.js user@example.com');
    process.exit(1);
}

// Update user to be admin
db.run('UPDATE users SET is_admin = 1 WHERE email = ?', [email], function(err) {
    if (err) {
        console.error('Error updating user:', err);
        process.exit(1);
    }
    
    if (this.changes === 0) {
        console.error('No user found with that email');
        process.exit(1);
    }
    
    console.log(`Successfully made ${email} an admin`);
    db.close();
}); 