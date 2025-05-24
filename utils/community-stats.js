const db = require('../db/init');

class CommunityStats {
    /**
     * Get top contributors based on various metrics
     */
    static async getTopContributors(limit = 3) {
        try {
            const contributors = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT 
                        u.id,
                        u.username,
                        COUNT(DISTINCT p.id) as community_posts
                    FROM users u
                    LEFT JOIN posts p ON u.id = p.user_id
                    WHERE u.username IS NOT NULL AND u.username != ''
                    GROUP BY u.id
                    HAVING community_posts > 0
                    ORDER BY community_posts DESC
                    LIMIT ?
                `, [limit], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            // Format data for display
            return contributors.map((contributor, index) => ({
                ...contributor,
                rank: index + 1,
                badge: this.getBadgeForRank(index + 1),
                avatar: contributor.username.charAt(0).toUpperCase()
            }));
            
        } catch (error) {
            console.error('Error getting top contributors:', error);
            return [];
        }
    }
    
    /**
     * Get top goal achievers specifically
     */
    static async getTopAchievers(limit = 5) {
        try {
            const achievers = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT 
                        u.id,
                        u.username,
                        COUNT(DISTINCT g.id) as total_goals,
                        SUM(CASE WHEN g.status = 'completed' THEN 1 ELSE 0 END) as completed_goals,
                        u.current_streak
                    FROM users u
                    LEFT JOIN goals g ON u.id = g.user_id
                    WHERE u.username IS NOT NULL AND u.username != ''
                    GROUP BY u.id
                    HAVING completed_goals > 0
                    ORDER BY completed_goals DESC, total_goals DESC
                    LIMIT ?
                `, [limit], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            return achievers.map((achiever, index) => ({
                ...achiever,
                rank: index + 1,
                avatar: achiever.username.charAt(0).toUpperCase(),
                badge: this.getBadgeForRank(index + 1)
            }));
            
        } catch (error) {
            console.error('Error getting top achievers:', error);
            return [];
        }
    }
    
    /**
     * Get top streak holders
     */
    static async getTopStreakHolders(limit = 5) {
        try {
            const streakHolders = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT 
                        u.id,
                        u.username,
                        u.current_streak,
                        COUNT(DISTINCT uda.activity_date) as total_active_days,
                        COUNT(DISTINCT g.id) as total_goals
                    FROM users u
                    LEFT JOIN user_daily_activity uda ON u.id = uda.user_id
                    LEFT JOIN goals g ON u.id = g.user_id
                    WHERE u.username IS NOT NULL AND u.username != '' AND u.current_streak > 0
                    GROUP BY u.id
                    ORDER BY u.current_streak DESC, total_active_days DESC
                    LIMIT ?
                `, [limit], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            return streakHolders.map((holder, index) => ({
                ...holder,
                rank: index + 1,
                avatar: holder.username.charAt(0).toUpperCase(),
                badge: this.getBadgeForRank(index + 1)
            }));
            
        } catch (error) {
            console.error('Error getting top streak holders:', error);
            return [];
        }
    }
    
    /**
     * Get community statistics overview
     */
    static async getCommunityOverview() {
        try {
            // Get total active users (users with at least 1 goal or activity in last 30 days)
            const activeUsers = await new Promise((resolve, reject) => {
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                db.get(`
                    SELECT COUNT(DISTINCT u.id) as count
                    FROM users u
                    LEFT JOIN goals g ON u.id = g.user_id
                    LEFT JOIN user_daily_activity uda ON u.id = uda.user_id
                    WHERE (g.created_at >= ? OR uda.activity_date >= ?)
                    AND u.username IS NOT NULL AND u.username != ''
                `, [thirtyDaysAgo, thirtyDaysAgo], (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                });
            });
            
            // Get total community posts
            const totalPosts = await new Promise((resolve, reject) => {
                db.get('SELECT COUNT(*) as count FROM posts', [], (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                });
            });
            
            // Get total goals achieved
            const totalGoalsAchieved = await new Promise((resolve, reject) => {
                db.get('SELECT COUNT(*) as count FROM goals WHERE status = "completed"', [], (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                });
            });
            
            // Get total community interactions (comments + likes)
            const totalInteractions = await new Promise((resolve, reject) => {
                db.get(`
                    SELECT 
                        (SELECT COUNT(*) FROM comments) + 
                        (SELECT COUNT(*) FROM post_likes) as count
                `, [], (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                });
            });
            
            return {
                activeUsers,
                totalPosts,
                totalGoalsAchieved,
                totalInteractions
            };
            
        } catch (error) {
            console.error('Error getting community overview:', error);
            return {
                activeUsers: 0,
                totalPosts: 0,
                totalGoalsAchieved: 0,
                totalInteractions: 0
            };
        }
    }
    
    /**
     * Get badge emoji for rank
     */
    static getBadgeForRank(rank) {
        switch (rank) {
            case 1: return '🏆';
            case 2: return '🥈';
            case 3: return '🥉';
            case 4: return '🏅';
            case 5: return '⭐';
            default: return '🏅';
        }
    }
    
    /**
     * Get trending categories based on recent goal creation
     */
    static async getTrendingCategories(limit = 5) {
        try {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            
            const trending = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT 
                        category,
                        COUNT(*) as recent_goals,
                        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_in_period
                    FROM goals 
                    WHERE created_at >= ? AND category IS NOT NULL AND category != ''
                    GROUP BY category
                    ORDER BY recent_goals DESC
                    LIMIT ?
                `, [sevenDaysAgo, limit], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            return trending.map(category => ({
                ...category,
                completionRate: category.recent_goals > 0 
                    ? Math.round((category.completed_in_period / category.recent_goals) * 100) 
                    : 0
            }));
            
        } catch (error) {
            console.error('Error getting trending categories:', error);
            return [];
        }
    }
}

module.exports = CommunityStats; 