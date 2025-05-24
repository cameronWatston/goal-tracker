const db = require('../db/init');

class StreakTracker {
    /**
     * Record daily activity for a user and update their streak
     */
    static async recordDailyActivity(userId, activityType = 'login') {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        
        try {
            // Check if user already has activity recorded for today
            const existingActivity = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT * FROM user_daily_activity WHERE user_id = ? AND activity_date = ?',
                    [userId, today],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            // If no activity today, record it
            if (!existingActivity) {
                await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO user_daily_activity (user_id, activity_date, activity_types) VALUES (?, ?, ?)',
                        [userId, today, JSON.stringify([activityType])],
                        function(err) {
                            if (err) reject(err);
                            else resolve(this.lastID);
                        }
                    );
                });
                
                console.log(`📅 Recorded daily activity for user ${userId} on ${today}`);
            } else {
                // Update activity types if new type
                const activityTypes = JSON.parse(existingActivity.activity_types || '[]');
                if (!activityTypes.includes(activityType)) {
                    activityTypes.push(activityType);
                    
                    await new Promise((resolve, reject) => {
                        db.run(
                            'UPDATE user_daily_activity SET activity_types = ? WHERE user_id = ? AND activity_date = ?',
                            [JSON.stringify(activityTypes), userId, today],
                            function(err) {
                                if (err) reject(err);
                                else resolve(this.changes);
                            }
                        );
                    });
                }
            }
            
            // Calculate and return current streak
            return await this.calculateCurrentStreak(userId);
            
        } catch (error) {
            console.error('Error recording daily activity:', error);
            return 0;
        }
    }
    
    /**
     * Calculate the current consecutive day streak for a user
     */
    static async calculateCurrentStreak(userId) {
        try {
            // Get user's activity history in descending order
            const activities = await new Promise((resolve, reject) => {
                db.all(
                    'SELECT activity_date FROM user_daily_activity WHERE user_id = ? ORDER BY activity_date DESC',
                    [userId],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            
            if (activities.length === 0) {
                return 0;
            }
            
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            
            let streak = 0;
            let currentDate = new Date();
            
            // Check if user has activity today or yesterday (grace period)
            const hasActivityToday = activities[0]?.activity_date === todayStr;
            const hasActivityYesterday = activities.length > 1 && activities[1]?.activity_date === yesterdayStr;
            const latestActivity = activities[0]?.activity_date;
            
            // If no activity today or yesterday, streak is broken
            if (latestActivity !== todayStr && latestActivity !== yesterdayStr) {
                return 0;
            }
            
            // Start from today or yesterday depending on latest activity
            if (hasActivityToday) {
                currentDate = new Date(todayStr);
            } else if (hasActivityYesterday) {
                currentDate = new Date(yesterdayStr);
            }
            
            // Count consecutive days
            for (let i = 0; i < activities.length; i++) {
                const activityDate = activities[i].activity_date;
                const expectedDate = currentDate.toISOString().split('T')[0];
                
                if (activityDate === expectedDate) {
                    streak++;
                    // Move to previous day
                    currentDate.setDate(currentDate.getDate() - 1);
                } else {
                    // Gap found, streak ends
                    break;
                }
            }
            
            // Update user's current streak in the database
            await this.updateUserStreak(userId, streak);
            
            return streak;
            
        } catch (error) {
            console.error('Error calculating streak:', error);
            return 0;
        }
    }
    
    /**
     * Update user's current streak in the users table
     */
    static async updateUserStreak(userId, streak) {
        try {
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE users SET current_streak = ? WHERE id = ?',
                    [streak, userId],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.changes);
                    }
                );
            });
        } catch (error) {
            console.error('Error updating user streak:', error);
        }
    }
    
    /**
     * Get user's current streak and longest streak
     */
    static async getUserStreakStats(userId) {
        try {
            const currentStreak = await this.calculateCurrentStreak(userId);
            
            // Calculate longest streak from activity history
            const activities = await new Promise((resolve, reject) => {
                db.all(
                    'SELECT activity_date FROM user_daily_activity WHERE user_id = ? ORDER BY activity_date ASC',
                    [userId],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            
            let longestStreak = 0;
            let tempStreak = 0;
            let previousDate = null;
            
            for (const activity of activities) {
                const activityDate = new Date(activity.activity_date);
                
                if (previousDate) {
                    const dayDiff = Math.floor((activityDate - previousDate) / (1000 * 60 * 60 * 24));
                    
                    if (dayDiff === 1) {
                        // Consecutive day
                        tempStreak++;
                    } else {
                        // Gap found, reset temp streak
                        longestStreak = Math.max(longestStreak, tempStreak);
                        tempStreak = 1;
                    }
                } else {
                    tempStreak = 1;
                }
                
                previousDate = activityDate;
            }
            
            longestStreak = Math.max(longestStreak, tempStreak);
            
            return {
                currentStreak,
                longestStreak,
                totalActiveDays: activities.length
            };
            
        } catch (error) {
            console.error('Error getting streak stats:', error);
            return {
                currentStreak: 0,
                longestStreak: 0,
                totalActiveDays: 0
            };
        }
    }
    
    /**
     * Get streak leaderboard
     */
    static async getStreakLeaderboard(limit = 10) {
        try {
            const leaderboard = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT u.id, u.username, u.current_streak, 
                            COUNT(uda.activity_date) as total_active_days
                     FROM users u
                     LEFT JOIN user_daily_activity uda ON u.id = uda.user_id
                     GROUP BY u.id
                     ORDER BY u.current_streak DESC, total_active_days DESC
                     LIMIT ?`,
                    [limit],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    }
                );
            });
            
            return leaderboard;
        } catch (error) {
            console.error('Error getting streak leaderboard:', error);
            return [];
        }
    }
}

module.exports = StreakTracker; 