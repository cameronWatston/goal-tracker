const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

// Use the database configuration for persistent disk support
const dbConfig = require('../config/database-config');
const dbPath = dbConfig.getDatabasePath();

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    console.log('✅ Connected to SQLite database at:', dbPath);
});

// Initialize database
db.serialize(() => {
    // Create users table with verification fields
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
        reset_expires DATETIME
    )`);

    // Add missing columns to existing users table if needed
    db.all(`PRAGMA table_info(users)`, (err, columns) => {
        if (err) {
            console.error('Error checking users table schema:', err);
            return;
        }
        
        const columnNames = columns.map(col => col.name);
        
        // Check for google_id column
        if (!columnNames.includes('google_id')) {
            db.run(`ALTER TABLE users ADD COLUMN google_id TEXT`, (err) => {
                if (err) {
                    console.error('Error adding google_id column:', err);
                } else {
                    console.log('Added google_id column to users table');
                    // Create unique index for google_id (safer than UNIQUE constraint on ALTER)
                    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL`, (indexErr) => {
                        if (indexErr) {
                            console.error('Error creating google_id index:', indexErr);
                        } else {
                            console.log('Created unique index for google_id column');
                        }
                    });
                }
            });
        }
        
        // Check for provider column (legacy - not used without Google OAuth)
        if (!columnNames.includes('provider')) {
            db.run(`ALTER TABLE users ADD COLUMN provider TEXT DEFAULT 'local'`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Error adding provider column:', err);
                } else {
                    console.log('Added provider column to users table (legacy)');
                }
            });
        }
        
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

        // Check for reset_token column
        if (!columnNames.includes('reset_token')) {
            db.run(`ALTER TABLE users ADD COLUMN reset_token TEXT`, (err) => {
                if (err) {
                    console.error('Error adding reset_token column:', err);
                } else {
                    console.log('Added reset_token column to users table');
                }
            });
        }
        
        // Check for reset_expires column
        if (!columnNames.includes('reset_expires')) {
            db.run(`ALTER TABLE users ADD COLUMN reset_expires DATETIME`, (err) => {
                if (err) {
                    console.error('Error adding reset_expires column:', err);
                } else {
                    console.log('Added reset_expires column to users table');
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
                
                // Check for start_date column
                if (!columnNames.includes('start_date')) {
                    db.run(`ALTER TABLE goals ADD COLUMN start_date DATE DEFAULT CURRENT_DATE`, (err) => {
                        if (err) {
                            console.error('Error adding start_date column:', err);
                        } else {
                            console.log('Added start_date column to goals table');
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
        display_order INTEGER DEFAULT 0,
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
    
    // Migration: Add display_order column to existing milestones table if it doesn't exist
    db.run(`PRAGMA table_info(milestones)`, (err, rows) => {
        if (!err) {
            db.all(`PRAGMA table_info(milestones)`, (err, columns) => {
                if (!err) {
                    const hasDisplayOrder = columns.some(col => col.name === 'display_order');
                    if (!hasDisplayOrder) {
                        console.log('Adding display_order column to milestones table...');
                        db.run(`ALTER TABLE milestones ADD COLUMN display_order INTEGER DEFAULT 0`, (err) => {
                            if (!err) {
                                console.log('Successfully added display_order column to milestones table');
                                // Set initial order based on creation date
                                db.run(`UPDATE milestones SET display_order = id WHERE display_order = 0`);
                            }
                        });
                    }
                }
            });
        }
    });
    
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

    // Notifications table for navbar notifications
    db.run(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            icon TEXT DEFAULT '🔔',
            is_read INTEGER DEFAULT 0,
            action_url TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    `);

    // Create user_achievements table
    db.run(`CREATE TABLE IF NOT EXISTS user_achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        achievement_id INTEGER NOT NULL,
        unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        progress INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, achievement_id)
    )`, (err) => {
        if (err) {
            console.error('Error creating user_achievements table:', err);
        } else {
            console.log('✅ User achievements table ready');
        }
    });

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
    )`, (err) => {
        if (err) {
            console.error('Error creating achievements table:', err);
        } else {
            console.log('✅ Achievements table ready');
            initializeAchievements();
        }
    });

    // Create user_daily_activity table for streak tracking
    db.run(`
        CREATE TABLE IF NOT EXISTS user_daily_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            activity_date DATE NOT NULL,
            activity_types TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, activity_date)
        )
    `, (err) => {
        if (err) {
            console.error('Error creating user_daily_activity table:', err);
        } else {
            console.log('✅ User daily activity table ready');
        }
    });

    // Add current_streak column to users table if it doesn't exist
    db.run(`
        ALTER TABLE users ADD COLUMN current_streak INTEGER DEFAULT 0
    `, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('Error adding current_streak column:', err);
        } else {
            console.log('✅ Users table streak column ready');
        }
    });

    // Create IP tracking table for admin analytics
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
    )`, (err) => {
        if (err) {
            console.error('Error creating ip_visits table:', err);
        } else {
            console.log('✅ IP visits tracking table ready');
        }
    });

    // Create unique index on ip_address for faster lookups
    db.run(`CREATE INDEX IF NOT EXISTS idx_ip_visits_ip ON ip_visits(ip_address)`, (err) => {
        if (err) {
            console.error('Error creating IP index:', err);
        } else {
            console.log('✅ IP visits index ready');
        }
    });

    // SEO settings table - NEW
    db.run(`CREATE TABLE IF NOT EXISTS seo_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_path TEXT NOT NULL UNIQUE,
        title TEXT,
        description TEXT,
        keywords TEXT,
        og_title TEXT,
        og_description TEXT,
        og_image TEXT,
        twitter_title TEXT,
        twitter_description TEXT,
        twitter_image TEXT,
        canonical_url TEXT,
        structured_data TEXT,
        custom_meta TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating seo_settings table:', err);
        } else {
            console.log('✅ SEO settings table ready');
            
            // Insert default SEO settings
            const defaultSeoSettings = [
                {
                    page_path: '/',
                    title: 'Goal Tracker - Achieve More with AI',
                    description: 'Transform your dreams into reality with our AI-powered goal tracking platform. Join 25,000+ users achieving their biggest goals.',
                    keywords: 'goal tracking, goal achievement, AI goals, personal development, productivity, milestone tracking, success planning, goal setting',
                    og_title: 'Goal Tracker - AI-Powered Goal Achievement',
                    og_description: 'Transform your dreams into reality with AI-powered goal tracking. Join 25,000+ users achieving their biggest goals.',
                    og_image: 'https://goaltracker.com/img/og-image.jpg',
                    canonical_url: 'https://goaltracker.com'
                },
                {
                    page_path: '/login',
                    title: 'Login - Goal Tracker',
                    description: 'Sign in to your Goal Tracker account and continue achieving your goals.',
                    canonical_url: 'https://goaltracker.com/login'
                },
                {
                    page_path: '/register',
                    title: 'Register - Goal Tracker',
                    description: 'Create your free Goal Tracker account and start achieving your dreams today.',
                    canonical_url: 'https://goaltracker.com/register'
                },
                {
                    page_path: '/contact',
                    title: 'Contact Us - Goal Tracker',
                    description: 'Get in touch with the Goal Tracker team. We\'re here to help you achieve your goals.',
                    canonical_url: 'https://goaltracker.com/contact'
                }
            ];

            defaultSeoSettings.forEach(setting => {
                db.run(`INSERT OR IGNORE INTO seo_settings 
                    (page_path, title, description, keywords, og_title, og_description, og_image, canonical_url) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [setting.page_path, setting.title, setting.description, setting.keywords, 
                     setting.og_title, setting.og_description, setting.og_image, setting.canonical_url],
                    (err) => {
                        if (err) {
                            console.error('Error inserting default SEO setting:', err);
                        }
                    });
            });
        }
    });

    // External Ads table - Simplified for revenue only
    db.run(`CREATE TABLE IF NOT EXISTS external_ads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        image_url TEXT,
        link_url TEXT NOT NULL,
        button_text TEXT NOT NULL,
        placement TEXT NOT NULL DEFAULT 'horizontal',
        is_active BOOLEAN DEFAULT TRUE,
        start_date DATETIME,
        end_date DATETIME,
        external_tracking_code TEXT,
        external_script TEXT,
        revenue_per_click DECIMAL(10,4) DEFAULT 0,
        revenue_per_impression DECIMAL(10,4) DEFAULT 0,
        max_daily_budget DECIMAL(10,2),
        current_daily_spend DECIMAL(10,2) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating external_ads table:', err);
        } else {
            console.log('✅ External ads table ready');
        }
    });

    // External Ad performance tracking table
    db.run(`CREATE TABLE IF NOT EXISTS external_ad_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ad_id INTEGER NOT NULL,
        user_id INTEGER,
        action_type TEXT NOT NULL,
        user_agent TEXT,
        ip_address TEXT,
        page_url TEXT,
        revenue_generated DECIMAL(10,4) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ad_id) REFERENCES external_ads(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`, (err) => {
        if (err) {
            console.error('Error creating external_ad_performance table:', err);
        } else {
            console.log('✅ External ad performance tracking table ready');
        }
    });

    // Blog system tables for SEO
    db.run(`CREATE TABLE IF NOT EXISTS blog_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        excerpt TEXT,
        content TEXT NOT NULL,
        author_id INTEGER NOT NULL,
        featured_image TEXT,
        category_id INTEGER,
        status TEXT DEFAULT 'draft',
        meta_title TEXT,
        meta_description TEXT,
        meta_keywords TEXT,
        view_count INTEGER DEFAULT 0,
        is_featured BOOLEAN DEFAULT FALSE,
        published_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users(id),
        FOREIGN KEY (category_id) REFERENCES blog_categories(id)
    )`, (err) => {
        if (err) {
            console.error('Error creating blog_posts table:', err);
        } else {
            console.log('✅ Blog posts table ready');
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS blog_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        meta_title TEXT,
        meta_description TEXT,
        post_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating blog_categories table:', err);
        } else {
            console.log('✅ Blog categories table ready');
            initializeBlogCategories();
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS blog_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        post_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating blog_tags table:', err);
        } else {
            console.log('✅ Blog tags table ready');
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS blog_post_tags (
        post_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (post_id, tag_id),
        FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES blog_tags(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) {
            console.error('Error creating blog_post_tags table:', err);
        } else {
            console.log('✅ Blog post tags table ready');
        }
    });

    // Create an admin user if none exists
    db.get("SELECT COUNT(*) as count FROM users WHERE is_admin = 1", (err, row) => {
        if (err) {
            console.error('Error checking for admin users:', err);
            return;
        }
        
        if (row.count === 0) {
            const adminPassword = 'admin123'; // Change this in production!
            
            bcrypt.hash(adminPassword, 10, (err, hash) => {
                if (err) {
                    console.error('Error hashing admin password:', err);
                    return;
                }
                
                db.run("INSERT INTO users (username, email, password, is_admin, is_verified) VALUES (?, ?, ?, ?, ?)",
                    ['admin', 'admin@goaltracker.com', hash, true, true], 
                    function(err) {
                        if (err) {
                            console.error('Error creating admin user:', err);
                        } else {
                            console.log('✅ Admin user created (username: admin, password: admin123)');
                            console.log('⚠️  Please change the admin password after first login!');
                        }
                    });
            });
        }
    });
});

// Initialize all achievements in the database
function initializeAchievements() {
    const achievements = [
        // 🏁 Getting Started (Bronze)
        { key_name: 'first_goal', title: 'First Steps', description: 'Create your very first goal', icon: 'fa-flag', category: 'getting_started', target_value: 1, tier: 'bronze', points: 10, rarity: 'common' },
        { key_name: 'welcome_aboard', title: 'Welcome Aboard', description: 'Complete your profile setup', icon: 'fa-user-check', category: 'getting_started', target_value: 1, tier: 'bronze', points: 5, rarity: 'common' },
        { key_name: 'first_milestone', title: 'Milestone Maker', description: 'Complete your first milestone', icon: 'fa-check-circle', category: 'getting_started', target_value: 1, tier: 'bronze', points: 15, rarity: 'common' },
        { key_name: 'first_week', title: 'Week Warrior', description: 'Use Goal Tracker for 7 consecutive days', icon: 'fa-calendar-week', category: 'engagement', target_value: 7, tier: 'bronze', points: 20, rarity: 'common' },
        { key_name: 'early_bird', title: 'Early Bird', description: 'Log in before 8 AM', icon: 'fa-sunrise', category: 'engagement', target_value: 1, tier: 'bronze', points: 10, rarity: 'common' },

        // 🎯 Goal Achievements (Bronze to Gold)
        { key_name: 'goal_creator', title: 'Goal Creator', description: 'Create 5 goals', icon: 'fa-plus-circle', category: 'goals', target_value: 5, tier: 'bronze', points: 25, rarity: 'common' },
        { key_name: 'goal_master', title: 'Goal Master', description: 'Create 25 goals', icon: 'fa-bullseye', category: 'goals', target_value: 25, tier: 'silver', points: 75, rarity: 'uncommon' },
        { key_name: 'goal_legend', title: 'Goal Legend', description: 'Create 100 goals', icon: 'fa-crown', category: 'goals', target_value: 100, tier: 'gold', points: 200, rarity: 'rare' },
        { key_name: 'completionist', title: 'Completionist', description: 'Complete 10 goals', icon: 'fa-trophy', category: 'completion', target_value: 10, tier: 'silver', points: 100, rarity: 'uncommon' },
        { key_name: 'achievement_hunter', title: 'Achievement Hunter', description: 'Complete 50 goals', icon: 'fa-medal', category: 'completion', target_value: 50, tier: 'gold', points: 300, rarity: 'rare' },

        // 📈 Progress & Streaks (Silver to Diamond)
        { key_name: 'consistency_king', title: 'Consistency King', description: 'Log progress for 30 consecutive days', icon: 'fa-fire', category: 'streaks', target_value: 30, tier: 'gold', points: 150, rarity: 'rare' },
        { key_name: 'unstoppable', title: 'Unstoppable', description: 'Maintain a 60-day streak', icon: 'fa-bolt', category: 'streaks', target_value: 60, tier: 'diamond', points: 400, rarity: 'epic' },
        { key_name: 'perfectionist', title: 'Perfectionist', description: 'Achieve 100% completion rate with 10+ goals', icon: 'fa-star', category: 'completion', target_value: 10, tier: 'gold', points: 250, rarity: 'rare' },
        { key_name: 'speed_demon', title: 'Speed Demon', description: 'Complete a goal ahead of schedule', icon: 'fa-rocket', category: 'completion', target_value: 1, tier: 'silver', points: 50, rarity: 'uncommon' },
        { key_name: 'marathon_runner', title: 'Marathon Runner', description: 'Complete a goal that took 6+ months', icon: 'fa-clock', category: 'completion', target_value: 1, tier: 'gold', points: 200, rarity: 'rare' },

        // 📝 Notes & Logs (Bronze to Silver)
        { key_name: 'note_taker', title: 'Note Taker', description: 'Add 10 notes to your goals', icon: 'fa-sticky-note', category: 'engagement', target_value: 10, tier: 'bronze', points: 30, rarity: 'common' },
        { key_name: 'detailed_tracker', title: 'Detailed Tracker', description: 'Add 50 check-in logs', icon: 'fa-list-check', category: 'engagement', target_value: 50, tier: 'silver', points: 80, rarity: 'uncommon' },
        { key_name: 'reflection_master', title: 'Reflection Master', description: 'Write notes for 30 different goals', icon: 'fa-book', category: 'engagement', target_value: 30, tier: 'silver', points: 100, rarity: 'uncommon' },
        { key_name: 'mood_tracker', title: 'Mood Tracker', description: 'Log moods in 25 check-ins', icon: 'fa-smile', category: 'engagement', target_value: 25, tier: 'bronze', points: 40, rarity: 'common' },
        { key_name: 'storyteller', title: 'Storyteller', description: 'Write a note with 500+ characters', icon: 'fa-feather', category: 'engagement', target_value: 1, tier: 'bronze', points: 20, rarity: 'common' },

        // 🏆 Special Achievements (Gold to Legendary)
        { key_name: 'overachiever', title: 'Overachiever', description: 'Complete 3 goals in one day', icon: 'fa-lightning-bolt', category: 'special', target_value: 3, tier: 'gold', points: 300, rarity: 'epic' },
        { key_name: 'multitasker', title: 'Multitasker', description: 'Have 10 active goals simultaneously', icon: 'fa-tasks', category: 'special', target_value: 10, tier: 'silver', points: 75, rarity: 'uncommon' },
        { key_name: 'category_master', title: 'Category Master', description: 'Complete goals in all 6 categories', icon: 'fa-th', category: 'special', target_value: 6, tier: 'gold', points: 200, rarity: 'rare' },
        { key_name: 'yearly_champion', title: 'Yearly Champion', description: 'Complete 365 check-ins in a year', icon: 'fa-calendar-year', category: 'special', target_value: 365, tier: 'legendary', points: 1000, rarity: 'legendary' },
        { key_name: 'community_helper', title: 'Community Helper', description: 'Share 10 goals with the community', icon: 'fa-hands-helping', category: 'social', target_value: 10, tier: 'silver', points: 60, rarity: 'uncommon' },

        // 💎 Category Specialists (Silver to Gold)
        { key_name: 'health_guru', title: 'Health Guru', description: 'Complete 10 health & fitness goals', icon: 'fa-heartbeat', category: 'health', target_value: 10, tier: 'silver', points: 100, rarity: 'uncommon' },
        { key_name: 'career_climber', title: 'Career Climber', description: 'Complete 10 career & education goals', icon: 'fa-briefcase', category: 'career', target_value: 10, tier: 'silver', points: 100, rarity: 'uncommon' },
        { key_name: 'finance_wizard', title: 'Finance Wizard', description: 'Complete 10 financial goals', icon: 'fa-dollar-sign', category: 'finance', target_value: 10, tier: 'silver', points: 100, rarity: 'uncommon' },
        { key_name: 'relationship_builder', title: 'Relationship Builder', description: 'Complete 10 relationship goals', icon: 'fa-heart', category: 'relationships', target_value: 10, tier: 'silver', points: 100, rarity: 'uncommon' },
        { key_name: 'personal_growth', title: 'Personal Growth', description: 'Complete 10 personal development goals', icon: 'fa-seedling', category: 'personal', target_value: 10, tier: 'silver', points: 100, rarity: 'uncommon' },
        { key_name: 'wellness_warrior', title: 'Wellness Warrior', description: 'Complete 25 health goals', icon: 'fa-spa', category: 'health', target_value: 25, tier: 'gold', points: 200, rarity: 'rare' },

        // 🎉 Fun & Unique (Bronze to Epic)
        { key_name: 'night_owl', title: 'Night Owl', description: 'Complete a milestone after 11 PM', icon: 'fa-moon', category: 'fun', target_value: 1, tier: 'bronze', points: 15, rarity: 'common' },
        { key_name: 'weekend_warrior', title: 'Weekend Warrior', description: 'Complete 5 goals on weekends', icon: 'fa-calendar-weekend', category: 'fun', target_value: 5, tier: 'bronze', points: 30, rarity: 'common' },
        { key_name: 'holiday_hero', title: 'Holiday Hero', description: 'Complete a goal on a holiday', icon: 'fa-gift', category: 'fun', target_value: 1, tier: 'silver', points: 50, rarity: 'uncommon' },
        { key_name: 'comeback_kid', title: 'Comeback Kid', description: 'Complete a goal after being inactive for 30+ days', icon: 'fa-undo', category: 'fun', target_value: 1, tier: 'silver', points: 75, rarity: 'uncommon' },
        { key_name: 'goal_recycler', title: 'Goal Recycler', description: 'Recreate a previously archived goal', icon: 'fa-recycle', category: 'fun', target_value: 1, tier: 'bronze', points: 25, rarity: 'common' },

        // 🚀 Advanced & Elite (Gold to Legendary)
        { key_name: 'efficiency_expert', title: 'Efficiency Expert', description: 'Complete 5 goals under 30 days each', icon: 'fa-tachometer-alt', category: 'advanced', target_value: 5, tier: 'gold', points: 250, rarity: 'rare' },
        { key_name: 'milestone_maniac', title: 'Milestone Maniac', description: 'Complete 100 milestones', icon: 'fa-mountain', category: 'advanced', target_value: 100, tier: 'gold', points: 300, rarity: 'rare' },
        { key_name: 'goal_architect', title: 'Goal Architect', description: 'Create goals with detailed 10+ milestone plans', icon: 'fa-drafting-compass', category: 'advanced', target_value: 5, tier: 'gold', points: 200, rarity: 'rare' },
        { key_name: 'time_master', title: 'Time Master', description: 'Complete goals exactly on their deadline (5 times)', icon: 'fa-stopwatch', category: 'advanced', target_value: 5, tier: 'diamond', points: 400, rarity: 'epic' },
        { key_name: 'balance_keeper', title: 'Balance Keeper', description: 'Maintain active goals in 4+ categories simultaneously', icon: 'fa-balance-scale', category: 'advanced', target_value: 4, tier: 'gold', points: 180, rarity: 'rare' },

        // 🌟 Premium & Elite (Diamond to Legendary)
        { key_name: 'premium_pioneer', title: 'Premium Pioneer', description: 'Subscribe to premium features', icon: 'fa-crown', category: 'premium', target_value: 1, tier: 'gold', points: 100, rarity: 'rare' },
        { key_name: 'ai_collaborator', title: 'AI Collaborator', description: 'Use AI features 25 times', icon: 'fa-robot', category: 'premium', target_value: 25, tier: 'gold', points: 150, rarity: 'rare' },
        { key_name: 'data_analyst', title: 'Data Analyst', description: 'Export goal data 10 times', icon: 'fa-chart-bar', category: 'premium', target_value: 10, tier: 'silver', points: 80, rarity: 'uncommon' },
        { key_name: 'social_influencer', title: 'Social Influencer', description: 'Get 50 likes on community posts', icon: 'fa-thumbs-up', category: 'social', target_value: 50, tier: 'gold', points: 200, rarity: 'rare' },
        { key_name: 'mentor', title: 'Mentor', description: 'Help others by commenting on 25 community posts', icon: 'fa-graduation-cap', category: 'social', target_value: 25, tier: 'gold', points: 150, rarity: 'rare' },

        // 🏅 Ultimate Achievements (Legendary)
        { key_name: 'goal_master_supreme', title: 'Goal Master Supreme', description: 'Complete 100 goals with 90%+ completion rate', icon: 'fa-infinity', category: 'legendary', target_value: 100, tier: 'legendary', points: 1000, rarity: 'legendary' },
        { key_name: 'thousand_days', title: 'Thousand Days', description: 'Use Goal Tracker for 1000 days', icon: 'fa-hourglass-end', category: 'legendary', target_value: 1000, tier: 'legendary', points: 2000, rarity: 'legendary' },
        { key_name: 'inspiration', title: 'Inspiration', description: 'Have your community post get 100+ likes', icon: 'fa-star-of-life', category: 'legendary', target_value: 100, tier: 'legendary', points: 500, rarity: 'legendary' },
        { key_name: 'life_changer', title: 'Life Changer', description: 'Complete transformative goals in all life areas', icon: 'fa-magic', category: 'legendary', target_value: 1, tier: 'legendary', points: 1500, rarity: 'legendary' },
        { key_name: 'goal_tracker_hero', title: 'Goal Tracker Hero', description: 'The ultimate achievement - master of all features', icon: 'fa-medal', category: 'legendary', target_value: 1, tier: 'legendary', points: 5000, rarity: 'legendary' }
    ];

    // Insert achievements if they don't exist
    const insertAchievement = (achievement) => {
        db.run(`INSERT OR IGNORE INTO achievements 
            (key_name, title, description, icon, category, target_value, tier, points, rarity) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [achievement.key_name, achievement.title, achievement.description, achievement.icon, 
             achievement.category, achievement.target_value, achievement.tier, achievement.points, achievement.rarity],
            function(err) {
                if (err) {
                    console.error('Error inserting achievement:', achievement.key_name, err);
                }
            }
        );
    };

    achievements.forEach(insertAchievement);
    console.log('🏆 Initialized 50 achievements in database');
}

// Initialize blog categories
function initializeBlogCategories() {
    const defaultCategories = [
        {
            name: 'Development',
            slug: 'development',
            description: 'Technical insights and development best practices',
            meta_title: 'Development Blog - Goal Tracker',
            meta_description: 'Technical articles about Goal Tracker development, best practices, and insights.'
        },
        {
            name: 'Product Updates',
            slug: 'product-updates',
            description: 'Latest features, improvements, and announcements',
            meta_title: 'Product Updates - Goal Tracker',
            meta_description: 'Stay updated with the latest Goal Tracker features, improvements, and announcements.'
        },
        {
            name: 'Goal Achievement',
            slug: 'goal-achievement',
            description: 'Tips, strategies, and insights for achieving your goals',
            meta_title: 'Goal Achievement Tips - Goal Tracker',
            meta_description: 'Expert tips and strategies for effective goal setting and achievement using Goal Tracker.'
        },
        {
            name: 'Case Studies',
            slug: 'case-studies',
            description: 'Real user success stories and case studies',
            meta_title: 'Success Stories - Goal Tracker',
            meta_description: 'Real user case studies and success stories from Goal Tracker community.'
        },
        {
            name: 'Technology',
            slug: 'technology',
            description: 'Technical deep dives and architecture insights',
            meta_title: 'Technology Blog - Goal Tracker',
            meta_description: 'Technical architecture, performance insights, and development methodologies behind Goal Tracker.'
        }
    ];

    defaultCategories.forEach(category => {
        db.run(`INSERT OR IGNORE INTO blog_categories 
            (name, slug, description, meta_title, meta_description) 
            VALUES (?, ?, ?, ?, ?)`,
            [category.name, category.slug, category.description, category.meta_title, category.meta_description],
            function(err) {
                if (err) {
                    console.error('Error inserting blog category:', category.name, err);
                }
            }
        );
    });
    
    console.log('📝 Initialized blog categories in database');
}

module.exports = db; 