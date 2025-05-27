const db = require('../db/init');

/**
 * Middleware to track user activity
 */
function trackUserActivity(req, res, next) {
    // Only track activity for authenticated users
    if (req.session && req.session.user) {
        const userId = req.session.user.id;
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || '';
        const pageUrl = req.originalUrl;
        
        // Update user's last activity
        updateUserLastActivity(userId, ipAddress);
        
        // Log the activity (async, don't block request)
        logUserActivity(userId, 'page_view', `Visited ${pageUrl}`, ipAddress, userAgent, pageUrl)
            .catch(err => console.error('Error logging user activity:', err));
    }
    
    next();
}

/**
 * Update user's last activity timestamp
 */
function updateUserLastActivity(userId, ipAddress) {
    const query = `
        UPDATE users 
        SET last_activity = CURRENT_TIMESTAMP,
            last_ip_address = ?
        WHERE id = ?
    `;
    
    db.run(query, [ipAddress, userId], (err) => {
        if (err) {
            console.error('Error updating user last activity:', err);
        }
    });
}

/**
 * Log detailed user activity
 */
function logUserActivity(userId, activityType, description, ipAddress, userAgent, pageUrl) {
    return new Promise((resolve, reject) => {
        const query = `
            INSERT INTO user_activity_logs 
            (user_id, activity_type, activity_description, ip_address, user_agent, page_url)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        db.run(query, [userId, activityType, description, ipAddress, userAgent, pageUrl], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.lastID);
            }
        });
    });
}

/**
 * Track user login
 */
function trackUserLogin(userId, ipAddress, userAgent) {
    return new Promise((resolve, reject) => {
        // Update user login stats
        const updateQuery = `
            UPDATE users 
            SET last_login = CURRENT_TIMESTAMP,
                last_activity = CURRENT_TIMESTAMP,
                total_sessions = total_sessions + 1,
                last_ip_address = ?
            WHERE id = ?
        `;
        
        db.run(updateQuery, [ipAddress, userId], (err) => {
            if (err) {
                reject(err);
                return;
            }
            
            // Log the login activity
            logUserActivity(userId, 'login', 'User logged in', ipAddress, userAgent, '/login')
                .then(resolve)
                .catch(reject);
        });
    });
}

/**
 * Track user logout
 */
function trackUserLogout(userId, ipAddress, userAgent) {
    return logUserActivity(userId, 'logout', 'User logged out', ipAddress, userAgent, '/logout');
}

/**
 * Track goal-related actions
 */
function trackGoalActivity(userId, actionType, goalId, description, req) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    const pageUrl = req.originalUrl;
    
    const activityDescription = `${description} (Goal ID: ${goalId})`;
    
    return logUserActivity(userId, 'goal_action', activityDescription, ipAddress, userAgent, pageUrl);
}

/**
 * Track community/post actions
 */
function trackCommunityActivity(userId, actionType, postId, description, req) {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    const pageUrl = req.originalUrl;
    
    const activityDescription = postId ? 
        `${description} (Post ID: ${postId})` : 
        description;
    
    return logUserActivity(userId, 'post_action', activityDescription, ipAddress, userAgent, pageUrl);
}

/**
 * Get user activity statistics
 */
function getUserActivityStats(userId) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT 
                COUNT(*) as total_activities,
                COUNT(CASE WHEN activity_type = 'login' THEN 1 END) as total_logins,
                COUNT(CASE WHEN activity_type = 'page_view' THEN 1 END) as total_page_views,
                COUNT(CASE WHEN activity_type = 'goal_action' THEN 1 END) as total_goal_actions,
                COUNT(CASE WHEN activity_type = 'post_action' THEN 1 END) as total_post_actions,
                MIN(created_at) as first_activity,
                MAX(created_at) as last_activity
            FROM user_activity_logs 
            WHERE user_id = ?
        `;
        
        db.get(query, [userId], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

/**
 * Get recent user activities
 */
function getRecentUserActivities(userId, limit = 50) {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT activity_type, activity_description, created_at, page_url
            FROM user_activity_logs 
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `;
        
        db.all(query, [userId, limit], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

/**
 * Get admin activity analytics
 */
function getActivityAnalytics() {
    return new Promise((resolve, reject) => {
        const queries = [
            // Active users in last 24 hours
            `SELECT COUNT(DISTINCT user_id) as active_24h 
             FROM user_activity_logs 
             WHERE created_at >= datetime('now', '-1 day')`,
            
            // Active users in last 7 days
            `SELECT COUNT(DISTINCT user_id) as active_7d 
             FROM user_activity_logs 
             WHERE created_at >= datetime('now', '-7 days')`,
            
            // Active users in last 30 days
            `SELECT COUNT(DISTINCT user_id) as active_30d 
             FROM user_activity_logs 
             WHERE created_at >= datetime('now', '-30 days')`,
            
            // Most active users
            `SELECT u.username, u.id, COUNT(*) as activity_count
             FROM user_activity_logs ual
             JOIN users u ON ual.user_id = u.id
             WHERE ual.created_at >= datetime('now', '-7 days')
             GROUP BY u.id
             ORDER BY activity_count DESC
             LIMIT 10`,
             
            // Activity by type
            `SELECT activity_type, COUNT(*) as count
             FROM user_activity_logs
             WHERE created_at >= datetime('now', '-7 days')
             GROUP BY activity_type
             ORDER BY count DESC`
        ];
        
        Promise.all([
            new Promise((res, rej) => db.get(queries[0], (err, row) => err ? rej(err) : res(row))),
            new Promise((res, rej) => db.get(queries[1], (err, row) => err ? rej(err) : res(row))),
            new Promise((res, rej) => db.get(queries[2], (err, row) => err ? rej(err) : res(row))),
            new Promise((res, rej) => db.all(queries[3], (err, rows) => err ? rej(err) : res(rows))),
            new Promise((res, rej) => db.all(queries[4], (err, rows) => err ? rej(err) : res(rows)))
        ])
        .then(([active24h, active7d, active30d, mostActive, activityTypes]) => {
            resolve({
                activeUsers: {
                    last24Hours: active24h.active_24h || 0,
                    last7Days: active7d.active_7d || 0,
                    last30Days: active30d.active_30d || 0
                },
                mostActiveUsers: mostActive || [],
                activityByType: activityTypes || []
            });
        })
        .catch(reject);
    });
}

module.exports = {
    trackUserActivity,
    updateUserLastActivity,
    logUserActivity,
    trackUserLogin,
    trackUserLogout,
    trackGoalActivity,
    trackCommunityActivity,
    getUserActivityStats,
    getRecentUserActivities,
    getActivityAnalytics
}; 