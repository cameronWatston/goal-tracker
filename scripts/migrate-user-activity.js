const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Database path - adjust if needed
const dbPath = path.join(__dirname, '..', 'db', 'database.sqlite');

console.log('🚀 Starting User Activity Tracking Migration...');
console.log('Database path:', dbPath);

// Read the migration SQL
const migrationSQL = fs.readFileSync(path.join(__dirname, '..', 'db', 'add_user_activity_tracking.sql'), 'utf8');

// Connect to database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
        process.exit(1);
    }
    console.log('✅ Connected to SQLite database');
});

// Run the migration
db.serialize(() => {
    // Split the SQL by semicolons and execute each statement
    const statements = migrationSQL.split(';').filter(stmt => stmt.trim().length > 0);
    
    let completed = 0;
    const total = statements.length;
    
    statements.forEach((statement, index) => {
        db.run(statement.trim(), (err) => {
            if (err) {
                console.error(`❌ Error executing statement ${index + 1}:`, err.message);
                console.error('Statement:', statement.trim());
            } else {
                completed++;
                console.log(`✅ Executed statement ${index + 1}/${total}`);
                
                if (completed === total) {
                    console.log('\n🎉 Migration completed successfully!');
                    console.log('✅ Added user activity tracking columns to users table');
                    console.log('✅ Created user_activity_logs table');
                    console.log('✅ Created indexes for better performance');
                    console.log('✅ Updated existing users with default values');
                    
                    // Verify the migration
                    verifyMigration();
                }
            }
        });
    });
});

function verifyMigration() {
    console.log('\n🔍 Verifying migration...');
    
    // Check if columns were added to users table
    db.all("PRAGMA table_info(users)", (err, rows) => {
        if (err) {
            console.error('❌ Error checking users table:', err.message);
        } else {
            const columnNames = rows.map(row => row.name);
            const requiredColumns = ['last_activity', 'last_login', 'total_sessions', 'last_ip_address'];
            
            const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
            
            if (missingColumns.length === 0) {
                console.log('✅ All required columns added to users table');
            } else {
                console.log('❌ Missing columns in users table:', missingColumns);
            }
        }
    });
    
    // Check if user_activity_logs table was created
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='user_activity_logs'", (err, row) => {
        if (err) {
            console.error('❌ Error checking user_activity_logs table:', err.message);
        } else if (row) {
            console.log('✅ user_activity_logs table created successfully');
        } else {
            console.log('❌ user_activity_logs table not found');
        }
        
        // Close database connection
        db.close((err) => {
            if (err) {
                console.error('❌ Error closing database:', err.message);
            } else {
                console.log('\n✅ Database connection closed');
                console.log('\n📝 Next Steps:');
                console.log('1. Add activity tracking middleware to your app.js');
                console.log('2. Update login/logout routes to track user sessions');
                console.log('3. Start tracking user activities!');
                console.log('\n🎯 Migration completed successfully! 🎯');
            }
        });
    });
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n⚠️  Migration interrupted');
    db.close();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    db.close();
    process.exit(1);
}); 