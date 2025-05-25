/**
 * Middleware to load ads from database and make them available to views
 */

const db = require('../db/init');

/**
 * Load active ads from database and add to res.locals
 */
const loadAds = (req, res, next) => {
    // Only load ads if user should see them (free users)
    if (!res.locals.shouldShowAds) {
        return next();
    }

    const currentTime = new Date().toISOString();
    
    db.all(`
        SELECT * FROM ads 
        WHERE is_active = 1 
        AND (start_date IS NULL OR start_date <= ?)
        AND (end_date IS NULL OR end_date >= ?)
        AND (max_daily_budget IS NULL OR current_daily_spend < max_daily_budget)
        ORDER BY display_order ASC, created_at DESC
    `, [currentTime, currentTime], (err, ads) => {
        if (err) {
            console.error('Error loading ads:', err);
            // Continue without ads on error
            res.locals.databaseAds = [];
        } else {
            res.locals.databaseAds = ads || [];
        }
        next();
    });
};

/**
 * Get ads for specific placement and audience
 */
const getAdsForPlacement = (placement, targetAudience, callback) => {
    const currentTime = new Date().toISOString();
    
    db.all(`
        SELECT * FROM ads 
        WHERE is_active = 1 
        AND placement = ?
        AND (target_audience = ? OR target_audience = 'all_users')
        AND (start_date IS NULL OR start_date <= ?)
        AND (end_date IS NULL OR end_date >= ?)
        AND (max_daily_budget IS NULL OR current_daily_spend < max_daily_budget)
        ORDER BY display_order ASC, created_at DESC
    `, [placement, targetAudience, currentTime, currentTime], callback);
};

/**
 * Update ad performance metrics
 */
const updateAdPerformance = (adId, actionType, userId, metadata = {}) => {
    const performanceData = {
        ad_id: adId,
        user_id: userId,
        action_type: actionType,
        user_agent: metadata.userAgent || null,
        ip_address: metadata.ipAddress || null,
        page_url: metadata.pageUrl || null,
        revenue_generated: metadata.revenue || 0
    };

    db.run(`
        INSERT INTO ad_performance 
        (ad_id, user_id, action_type, user_agent, ip_address, page_url, revenue_generated) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
        performanceData.ad_id,
        performanceData.user_id,
        performanceData.action_type,
        performanceData.user_agent,
        performanceData.ip_address,
        performanceData.page_url,
        performanceData.revenue_generated
    ], (err) => {
        if (err) {
            console.error('Error updating ad performance:', err);
        }
    });
};

/**
 * Reset daily spending for all ads (should be run daily)
 */
const resetDailySpending = () => {
    db.run('UPDATE ads SET current_daily_spend = 0', (err) => {
        if (err) {
            console.error('Error resetting daily spending:', err);
        } else {
            console.log('Daily ad spending reset successfully');
        }
    });
};

/**
 * Get ad analytics
 */
const getAdAnalytics = (adId, dateRange, callback) => {
    let dateFilter;
    switch (dateRange) {
        case 'day':
            dateFilter = "datetime('now', '-1 day')";
            break;
        case 'week':
            dateFilter = "datetime('now', '-7 days')";
            break;
        case 'month':
            dateFilter = "datetime('now', '-30 days')";
            break;
        case 'year':
            dateFilter = "datetime('now', '-1 year')";
            break;
        default:
            dateFilter = "datetime('now', '-7 days')";
    }

    db.all(`
        SELECT 
            DATE(created_at) as date,
            action_type,
            COUNT(*) as count,
            SUM(revenue_generated) as revenue
        FROM ad_performance 
        WHERE ad_id = ? AND created_at >= ${dateFilter}
        GROUP BY DATE(created_at), action_type
        ORDER BY date ASC
    `, [adId], callback);
};

module.exports = {
    loadAds,
    getAdsForPlacement,
    updateAdPerformance,
    resetDailySpending,
    getAdAnalytics
}; 