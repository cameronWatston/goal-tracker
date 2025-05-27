const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

// Ensure /data directory exists
if (!fs.existsSync('/data')) {
    fs.mkdirSync('/data', { recursive: true });
    console.log('Created /data directory');
}

// Database path on Render
const dbPath = '/data/database.sqlite';

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    console.log('Connected to database at', dbPath);
});

// Initialize database tables
db.serialize(() => {
    // Create users table with all required fields
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        google_id TEXT UNIQUE,
        provider TEXT DEFAULT 'local',
        verification_code TEXT,
        is_verified INTEGER DEFAULT 0,
        is_admin INTEGER DEFAULT 0,
        verification_expires DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        subscription_plan TEXT DEFAULT 'free',
        subscription_id TEXT,
        stripe_customer_id TEXT,
        subscription_start DATETIME,
        subscription_end DATETIME,
        reset_token TEXT,
        reset_expires DATETIME,
        current_streak INTEGER DEFAULT 0
    )`);

    // Create goals table
    db.run(`CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT,
        status TEXT DEFAULT 'active',
        start_date DATE DEFAULT CURRENT_DATE,
        target_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Create milestones table
    db.run(`CREATE TABLE IF NOT EXISTS milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        target_date DATE NOT NULL,
        metrics TEXT,
        status TEXT DEFAULT 'pending',
        display_order INTEGER DEFAULT 0,
        progress_percentage INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (goal_id) REFERENCES goals(id)
    )`);

    // Create goal_logs table
    db.run(`CREATE TABLE IF NOT EXISTS goal_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        mood TEXT DEFAULT 'neutral',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (goal_id) REFERENCES goals(id)
    )`);

    // Create goal_notes table
    db.run(`CREATE TABLE IF NOT EXISTS goal_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (goal_id) REFERENCES goals(id)
    )`);

    // Create posts table
    db.run(`CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        goal_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (goal_id) REFERENCES goals(id)
    )`);

    // Create comments table
    db.run(`CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Create notifications table
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT,
        icon TEXT DEFAULT '🔔',
        is_read INTEGER DEFAULT 0,
        action_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Create user_achievements table
    db.run(`CREATE TABLE IF NOT EXISTS user_achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        achievement_id INTEGER NOT NULL,
        unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        progress INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, achievement_id)
    )`);

    // Create achievements table
    db.run(`CREATE TABLE IF NOT EXISTS achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_name TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        icon TEXT NOT NULL,
        category TEXT NOT NULL,
        target_value INTEGER DEFAULT 1,
        tier TEXT DEFAULT 'bronze',
        points INTEGER DEFAULT 10,
        rarity TEXT DEFAULT 'common',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create user_daily_activity table
    db.run(`CREATE TABLE IF NOT EXISTS user_daily_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        activity_date DATE NOT NULL,
        activity_types TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, activity_date)
    )`);

    // Create user_activity_logs table
    db.run(`CREATE TABLE IF NOT EXISTS user_activity_logs (
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

    // Create ip_visits table
    db.run(`CREATE TABLE IF NOT EXISTS ip_visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_address TEXT NOT NULL,
        user_agent TEXT,
        referer TEXT,
        page_path TEXT,
        country TEXT,
        city TEXT,
        first_visit DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_visit DATETIME DEFAULT CURRENT_TIMESTAMP,
        visit_count INTEGER DEFAULT 1,
        is_unique INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Check if admin exists
    db.get('SELECT * FROM users WHERE is_admin = 1', async (err, admin) => {
        if (err) {
            console.error('Error checking admin:', err);
            return;
        }
        
        // If no admin exists, create one
        if (!admin) {
            const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            
            db.run('INSERT INTO users (username, email, password, is_admin, is_verified) VALUES (?, ?, ?, 1, 1)',
                ['admin', process.env.ADMIN_EMAIL || 'admin@example.com', hashedPassword],
                function(err) {
                    if (err) {
                        console.error('Error creating admin:', err);
                        return;
                    }
                    console.log('Created admin user');
                }
            );
        }
    });
});

// Create sessions table
const sessionsDb = new sqlite3.Database('/data/sessions.sqlite', (err) => {
    if (err) {
        console.error('Error opening sessions database:', err);
        return;
    }
    console.log('Connected to sessions database');
}); 