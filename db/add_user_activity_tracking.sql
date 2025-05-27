-- Add user activity tracking columns
-- Migration: Add last_activity tracking to users table

ALTER TABLE users ADD COLUMN last_activity DATETIME;
ALTER TABLE users ADD COLUMN last_login DATETIME;
ALTER TABLE users ADD COLUMN total_sessions INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN last_ip_address TEXT;

-- Create user_activity_logs table for detailed activity tracking
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    activity_type TEXT NOT NULL, -- 'login', 'logout', 'page_view', 'goal_action', 'post_action'
    activity_description TEXT,
    ip_address TEXT,
    user_agent TEXT,
    page_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_activity_type ON user_activity_logs(activity_type);

-- Update existing users with default values
UPDATE users SET 
    last_activity = created_at,
    last_login = created_at,
    total_sessions = 1,
    last_ip_address = NULL
WHERE last_activity IS NULL; 