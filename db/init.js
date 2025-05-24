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

module.exports = db; 