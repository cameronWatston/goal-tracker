const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

// Create database connection
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    console.log('Connected to SQLite database');
});

// Initialize database
db.serialize(() => {
    // Create users table with verification fields
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        verification_code TEXT,
        is_verified INTEGER DEFAULT 0,
        is_admin INTEGER DEFAULT 0,
        verification_expires DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        subscription_plan TEXT DEFAULT 'free',
        subscription_id TEXT,
        stripe_customer_id TEXT,
        subscription_start DATETIME,
        subscription_end DATETIME
    )`);

    // Add missing columns to existing users table if needed
    db.all(`PRAGMA table_info(users)`, (err, columns) => {
        if (err) {
            console.error('Error checking users table schema:', err);
            return;
        }
        
        const columnNames = columns.map(col => col.name);
        
        // Check for is_admin column
        if (!columnNames.includes('is_admin')) {
            db.run(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`, (err) => {
                if (err) {
                    console.error('Error adding is_admin column:', err);
                } else {
                    console.log('Added is_admin column to users table');
                }
            });
        }
        
        // Check for subscription_plan column
        if (!columnNames.includes('subscription_plan')) {
            db.run(`ALTER TABLE users ADD COLUMN subscription_plan TEXT DEFAULT 'free'`, (err) => {
                if (err) {
                    console.error('Error adding subscription_plan column:', err);
                } else {
                    console.log('Added subscription_plan column to users table');
                }
            });
        }
        
        // Check for stripe_customer_id column
        if (!columnNames.includes('stripe_customer_id')) {
            db.run(`ALTER TABLE users ADD COLUMN stripe_customer_id TEXT`, (err) => {
                if (err) {
                    console.error('Error adding stripe_customer_id column:', err);
                } else {
                    console.log('Added stripe_customer_id column to users table');
                }
            });
        }
        
        // Check for subscription_id column
        if (!columnNames.includes('subscription_id')) {
            db.run(`ALTER TABLE users ADD COLUMN subscription_id TEXT`, (err) => {
                if (err) {
                    console.error('Error adding subscription_id column:', err);
                } else {
                    console.log('Added subscription_id column to users table');
                }
            });
        }

        // Check for subscription_start column
        if (!columnNames.includes('subscription_start')) {
            db.run(`ALTER TABLE users ADD COLUMN subscription_start DATETIME`, (err) => {
                if (err) {
                    console.error('Error adding subscription_start column:', err);
                } else {
                    console.log('Added subscription_start column to users table');
                }
            });
        }

        // Check for subscription_end column
        if (!columnNames.includes('subscription_end')) {
            db.run(`ALTER TABLE users ADD COLUMN subscription_end DATETIME`, (err) => {
                if (err) {
                    console.error('Error adding subscription_end column:', err);
                } else {
                    console.log('Added subscription_end column to users table');
                }
            });
        }
    });

    // First check if the goals table exists
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='goals'`, (err, table) => {
        if (err) {
            console.error('Error checking if goals table exists:', err);
            return;
        }
        
        if (!table) {
            // If table doesn't exist, create it with all columns
            db.run(`CREATE TABLE goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                category TEXT,
                start_date DATE DEFAULT CURRENT_DATE,
                target_date DATE NOT NULL,
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`);
            console.log('Created goals table with all required columns');
        } else {
            // If table exists, check its schema and add missing columns
            db.all(`PRAGMA table_info(goals)`, (err, columns) => {
                if (err) {
                    console.error('Error checking goals table schema:', err);
                    return;
                }
                
                const columnNames = columns.map(col => col.name);
                
                // Check for category column
                if (!columnNames.includes('category')) {
                    db.run(`ALTER TABLE goals ADD COLUMN category TEXT`, (err) => {
                        if (err) {
                            console.error('Error adding category column:', err);
                        } else {
                            console.log('Added category column to goals table');
                        }
                    });
                }
                
                // Check for target_date column
                if (!columnNames.includes('target_date')) {
                    db.run(`ALTER TABLE goals ADD COLUMN target_date DATE NOT NULL DEFAULT CURRENT_DATE`, (err) => {
                        if (err) {
                            console.error('Error adding target_date column:', err);
                        } else {
                            console.log('Added target_date column to goals table');
                        }
                    });
                }
                
                // Check for updated_at column
                if (!columnNames.includes('updated_at')) {
                    db.run(`ALTER TABLE goals ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {
                        if (err) {
                            console.error('Error adding updated_at column:', err);
                        } else {
                            console.log('Added updated_at column to goals table');
                        }
                    });
                }
            });
        }
    });

    // Create milestones table if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        target_date DATE NOT NULL,
        metrics TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (goal_id) REFERENCES goals(id)
    )`);
    
    // Create goal logs table (for check-ins)
    db.run(`CREATE TABLE IF NOT EXISTS goal_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        mood TEXT DEFAULT 'neutral',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (goal_id) REFERENCES goals(id)
    )`);
    
    // Create goal notes table
    db.run(`CREATE TABLE IF NOT EXISTS goal_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (goal_id) REFERENCES goals(id)
    )`);
    
    // Create motivation items table
    db.run(`CREATE TABLE IF NOT EXISTS motivation_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        type TEXT NOT NULL, /* 'image', 'quote', 'reminder' */
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (goal_id) REFERENCES goals(id)
    )`);
    
    // Create social posts table
    db.run(`CREATE TABLE IF NOT EXISTS social_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        goal_id INTEGER,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        image_url TEXT,
        category TEXT,
        likes INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (goal_id) REFERENCES goals(id)
    )`);
    
    // Create comments table
    db.run(`CREATE TABLE IF NOT EXISTS post_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES social_posts(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    
    // Create post likes table
    db.run(`CREATE TABLE IF NOT EXISTS post_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES social_posts(id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(post_id, user_id)
    )`);

    // Posts table for community
    db.run(`
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            goal_id INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (goal_id) REFERENCES goals (id)
        )
    `);
    
    // Comments table
    db.run(`
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    `);
    
    // Post likes table
    db.run(`
        CREATE TABLE IF NOT EXISTS post_likes (
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (post_id, user_id),
            FOREIGN KEY (post_id) REFERENCES posts (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    `);
});

module.exports = db; 