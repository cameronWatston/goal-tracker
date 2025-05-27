const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Use the persistent disk path on Render, otherwise use local path
const dbPath = process.env.RENDER ? '/data/database.sqlite' : path.join(__dirname, '..', 'db', 'database.sqlite');

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    console.log('Connected to database at', dbPath);
});

// Helper function to run SQL as a promise
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

// Helper function to get data as a promise
function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

async function migrateDatabase() {
    try {
        // Check if table exists
        const table = await getQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='user_activity_logs'");
        
        if (table) {
            console.log('Table exists, checking schema...');
            
            // Check if page_url column exists
            const columns = await getQuery("PRAGMA table_info(user_activity_logs)");
            const hasPageUrl = columns.some(col => col.name === 'page_url');
            const hasActivityDescription = columns.some(col => col.name === 'activity_description');
            
            if (!hasPageUrl || !hasActivityDescription) {
                console.log('Backing up existing data...');
                // Create backup table
                await runQuery('CREATE TABLE IF NOT EXISTS user_activity_logs_backup AS SELECT * FROM user_activity_logs');
                
                // Drop original table
                await runQuery('DROP TABLE user_activity_logs');
                
                // Create new table with correct schema
                await runQuery(`CREATE TABLE user_activity_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    activity_type TEXT NOT NULL,
                    activity_description TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    page_url TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )`);
                
                // Copy data, mapping old columns to new ones
                await runQuery(`INSERT INTO user_activity_logs 
                    (id, user_id, activity_type, activity_description, ip_address, user_agent, created_at)
                    SELECT id, user_id, activity_type, 
                           COALESCE(activity_description, activity_data) as activity_description,
                           ip_address, user_agent, created_at 
                    FROM user_activity_logs_backup`);
                
                // Drop backup table
                await runQuery('DROP TABLE user_activity_logs_backup');
                console.log('Successfully migrated user_activity_logs table!');
            } else {
                console.log('Table schema is already correct');
            }
        } else {
            console.log('Creating user_activity_logs table...');
            // Create table with correct schema
            await runQuery(`CREATE TABLE user_activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                activity_type TEXT NOT NULL,
                activity_description TEXT,
                ip_address TEXT,
                user_agent TEXT,
                page_url TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`);
            console.log('Created user_activity_logs table with correct schema');
        }
        
        // Verify table exists
        const verifyTable = await getQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='user_activity_logs'");
        if (verifyTable) {
            console.log('✅ Table exists and is ready to use');
        } else {
            throw new Error('Table was not created successfully');
        }
        
        // Close database connection
        db.close();
        console.log('Migration completed successfully');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run the migration
migrateDatabase(); 