const db = require('../db/init');

class AchievementTracker {
    // Check and unlock achievement for a user
    static async checkAndUnlockAchievement(userId, achievementKey, currentValue = 1) {
        try {
            // Get achievement info
            const achievement = await this.getAchievementByKey(achievementKey);
            if (!achievement) return null;

            // Check if user already has this achievement
            const userAchievement = await this.getUserAchievement(userId, achievement.id);
            
            if (userAchievement) {
                // Update progress if not yet unlocked
                if (userAchievement.progress < achievement.target_value) {
                    const newProgress = Math.min(currentValue, achievement.target_value);
                    await this.updateUserAchievementProgress(userId, achievement.id, newProgress);
                    
                    // Check if now unlocked
                    if (newProgress >= achievement.target_value) {
                        // Create notification for unlocked achievement
                        await this.createAchievementNotification(userId, achievement);
                        
                        return {
                            unlocked: true,
                            achievement: achievement,
                            message: `🏆 Achievement Unlocked: ${achievement.title}!`
                        };
                    }
                }
                return null;
            }

            // Create new user achievement
            const progress = Math.min(currentValue, achievement.target_value);
            await this.createUserAchievement(userId, achievement.id, progress);

            if (progress >= achievement.target_value) {
                // Create notification for unlocked achievement
                await this.createAchievementNotification(userId, achievement);
                
                return {
                    unlocked: true,
                    achievement: achievement,
                    message: `🏆 Achievement Unlocked: ${achievement.title}!`
                };
            }

            return null;
        } catch (error) {
            console.error('Error checking achievement:', error);
            return null;
        }
    }

    // Track multiple achievements at once
    static async trackMultipleAchievements(userId, events) {
        const unlockedAchievements = [];
        
        for (const event of events) {
            const result = await this.checkAndUnlockAchievement(userId, event.key, event.value);
            if (result && result.unlocked) {
                unlockedAchievements.push(result);
            }
        }
        
        return unlockedAchievements;
    }

    // Get user's achievements with progress
    static async getUserAchievements(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    a.*,
                    ua.progress,
                    ua.unlocked_at,
                    CASE WHEN ua.progress >= a.target_value THEN 1 ELSE 0 END as unlocked
                FROM achievements a
                LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
                ORDER BY 
                    CASE a.tier 
                        WHEN 'bronze' THEN 1 
                        WHEN 'silver' THEN 2 
                        WHEN 'gold' THEN 3 
                        WHEN 'diamond' THEN 4 
                        WHEN 'legendary' THEN 5 
                        ELSE 6 
                    END,
                    a.points ASC
            `;
            
            db.all(query, [userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows.map(row => ({
                        ...row,
                        progress: row.progress || 0,
                        unlocked: row.unlocked === 1,
                        progress_percentage: Math.round((row.progress || 0) / row.target_value * 100)
                    })));
                }
            });
        });
    }

    // Get user's achievement statistics
    static async getUserAchievementStats(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    COUNT(*) as total_achievements,
                    SUM(CASE WHEN ua.progress >= a.target_value THEN 1 ELSE 0 END) as unlocked_achievements,
                    SUM(CASE WHEN ua.progress >= a.target_value THEN a.points ELSE 0 END) as total_points,
                    SUM(CASE WHEN ua.progress >= a.target_value AND a.tier = 'bronze' THEN 1 ELSE 0 END) as bronze_count,
                    SUM(CASE WHEN ua.progress >= a.target_value AND a.tier = 'silver' THEN 1 ELSE 0 END) as silver_count,
                    SUM(CASE WHEN ua.progress >= a.target_value AND a.tier = 'gold' THEN 1 ELSE 0 END) as gold_count,
                    SUM(CASE WHEN ua.progress >= a.target_value AND a.tier = 'diamond' THEN 1 ELSE 0 END) as diamond_count,
                    SUM(CASE WHEN ua.progress >= a.target_value AND a.tier = 'legendary' THEN 1 ELSE 0 END) as legendary_count
                FROM achievements a
                LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
            `;
            
            db.get(query, [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    const stats = {
                        ...row,
                        completion_percentage: Math.round((row.unlocked_achievements / row.total_achievements) * 100)
                    };
                    resolve(stats);
                }
            });
        });
    }

    // Get recently unlocked achievements
    static async getRecentlyUnlockedAchievements(userId, limit = 5) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT a.*, ua.unlocked_at
                FROM achievements a
                JOIN user_achievements ua ON a.id = ua.achievement_id
                WHERE ua.user_id = ? AND ua.progress >= a.target_value
                ORDER BY ua.unlocked_at DESC
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

    // Helper methods
    static getAchievementByKey(key) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM achievements WHERE key_name = ?', [key], (err, row) => {
                if (err) {
                    console.warn('Error getting achievement by key:', key, err);
                    resolve(null);
                } else {
                    resolve(row);
                }
            });
        });
    }

    static getUserAchievement(userId, achievementId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?', 
                [userId, achievementId], (err, row) => {
                if (err) {
                    console.warn('Error getting user achievement:', err);
                    resolve(null);
                } else {
                    resolve(row);
                }
            });
        });
    }

    static createUserAchievement(userId, achievementId, progress) {
        return new Promise((resolve, reject) => {
            db.run('INSERT INTO user_achievements (user_id, achievement_id, progress) VALUES (?, ?, ?)',
                [userId, achievementId, progress], function(err) {
                if (err) {
                    console.warn('Error creating user achievement:', err);
                    resolve(null);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }

    static updateUserAchievementProgress(userId, achievementId, progress) {
        return new Promise((resolve, reject) => {
            db.run('UPDATE user_achievements SET progress = ? WHERE user_id = ? AND achievement_id = ?',
                [progress, userId, achievementId], function(err) {
                if (err) {
                    console.warn('Error updating user achievement progress:', err);
                    resolve(0);
                } else {
                    resolve(this.changes);
                }
            });
        });
    }

    // Create achievement notification for user
    static async createAchievementNotification(userId, achievement) {
        try {
            // Ensure achievement has proper values
            const title = achievement.title || 'New Achievement';
            const description = achievement.description || 'You unlocked a new achievement!';
            const icon = achievement.icon || 'fa-trophy'; // Use achievement's icon or default
            
            // Create well-formatted notification content
            const notificationTitle = `🏆 Achievement Unlocked: ${title}`;
            const notificationContent = `Congratulations! You've unlocked "${title}". ${description}`;
            
            // Insert notification into notifications table with the achievement's icon
            const notificationId = await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO notifications (user_id, title, message, type, icon, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                    [userId, notificationTitle, notificationContent, 'achievement', icon, 0],
                    function(err) {
                        if (err) {
                            console.warn('Error creating achievement notification:', err);
                            resolve(null);
                        } else {
                            resolve(this.lastID);
                        }
                    }
                );
            });
            
            console.log(`📧 Created achievement notification for user ${userId}: ${title} (${icon})`);
            return notificationId;
        } catch (error) {
            console.warn('Error creating achievement notification:', error);
            return null;
        }
    }

    // Achievement event tracking methods
    static async trackGoalCreated(userId) {
        // Get user's total goals count
        const goalCount = await this.getUserGoalCount(userId);
        
        const events = [
            { key: 'first_goal', value: goalCount },
            { key: 'goal_creator', value: goalCount },
            { key: 'goal_master', value: goalCount },
            { key: 'goal_legend', value: goalCount }
        ];
        
        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackGoalCompleted(userId, goalData) {
        const completedCount = await this.getUserCompletedGoalCount(userId);
        const categoryCompletedCount = await this.getUserCompletedGoalCountByCategory(userId, goalData.category);
        
        const events = [
            { key: 'completionist', value: completedCount },
            { key: 'achievement_hunter', value: completedCount }
        ];

        // Category-specific achievements
        if (goalData.category) {
            const categoryKey = `${goalData.category}_guru`;
            if (goalData.category === 'health') {
                events.push({ key: 'health_guru', value: categoryCompletedCount });
                events.push({ key: 'wellness_warrior', value: categoryCompletedCount });
            } else if (goalData.category === 'career') {
                events.push({ key: 'career_climber', value: categoryCompletedCount });
            } else if (goalData.category === 'finance') {
                events.push({ key: 'finance_wizard', value: categoryCompletedCount });
            } else if (goalData.category === 'relationships') {
                events.push({ key: 'relationship_builder', value: categoryCompletedCount });
            } else if (goalData.category === 'personal') {
                events.push({ key: 'personal_growth', value: categoryCompletedCount });
            }
        }

        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackMilestoneCompleted(userId) {
        const milestoneCount = await this.getUserCompletedMilestoneCount(userId);
        
        const events = [
            { key: 'first_milestone', value: milestoneCount },
            { key: 'milestone_maniac', value: milestoneCount }
        ];
        
        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackNoteAdded(userId) {
        const noteCount = await this.getUserNoteCount(userId);
        const goalNoteCount = await this.getUserUniqueGoalNoteCount(userId);
        
        const events = [
            { key: 'note_taker', value: noteCount },
            { key: 'reflection_master', value: goalNoteCount }
        ];
        
        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackCheckInLogged(userId, mood) {
        const logCount = await this.getUserLogCount(userId);
        const moodLogCount = mood ? await this.getUserMoodLogCount(userId) : 0;
        
        const events = [
            { key: 'detailed_tracker', value: logCount }
        ];
        
        if (mood) {
            events.push({ key: 'mood_tracker', value: moodLogCount });
        }
        
        return await this.trackMultipleAchievements(userId, events);
    }

    // New comprehensive tracking methods for all missing achievements
    static async trackProfileCompleted(userId) {
        // Track profile completion achievement
        const events = [
            { key: 'welcome_aboard', value: 1 }
        ];
        
        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackDailyLogin(userId) {
        const hour = new Date().getHours();
        const StreakTracker = require('./streak-tracker');
        const streakStats = await StreakTracker.getUserStreakStats(userId);
        const loginStreak = streakStats.currentStreak;
        const isWeekend = [0, 6].includes(new Date().getDay());
        
        const events = [];
        
        // Early bird achievement (login before 8 AM)
        if (hour < 8) {
            events.push({ key: 'early_bird', value: 1 });
        }
        
        // Week warrior (7 consecutive days)
        events.push({ key: 'first_week', value: loginStreak });
        
        // Consistency achievements
        events.push({ key: 'consistency_king', value: loginStreak });
        events.push({ key: 'unstoppable', value: loginStreak });
        
        // Weekend warrior
        if (isWeekend) {
            const weekendLogins = await this.getUserWeekendLogins(userId);
            events.push({ key: 'weekend_warrior', value: weekendLogins });
        }
        
        // Thousand days achievement - use real total active days
        events.push({ key: 'thousand_days', value: streakStats.totalActiveDays });
        
        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackGoalCompletedWithTiming(userId, goalData) {
        const completedCount = await this.getUserCompletedGoalCount(userId);
        const events = [];
        
        // Basic completion tracking
        events.push({ key: 'completionist', value: completedCount });
        events.push({ key: 'achievement_hunter', value: completedCount });
        
        // Speed demon - completed ahead of schedule
        if (goalData.target_date) {
            const targetDate = new Date(goalData.target_date);
            const completedDate = new Date();
            if (completedDate < targetDate) {
                events.push({ key: 'speed_demon', value: 1 });
            }
        }
        
        // Marathon runner - goal that took 6+ months
        if (goalData.created_at) {
            const createdDate = new Date(goalData.created_at);
            const completedDate = new Date();
            const monthsDiff = (completedDate - createdDate) / (1000 * 60 * 60 * 24 * 30);
            if (monthsDiff >= 6) {
                events.push({ key: 'marathon_runner', value: 1 });
            }
        }
        
        // Night owl - completed after 11 PM
        const hour = new Date().getHours();
        if (hour >= 23 || hour < 6) {
            events.push({ key: 'night_owl', value: 1 });
        }
        
        // Perfectionist - 100% completion rate with 10+ goals
        const totalGoals = await this.getUserGoalCount(userId);
        if (totalGoals >= 10) {
            const completionRate = (completedCount / totalGoals) * 100;
            if (completionRate >= 100) {
                events.push({ key: 'perfectionist', value: totalGoals });
            }
        }
        
        // Goal master supreme - 100 goals with 90%+ rate
        if (totalGoals >= 100) {
            const completionRate = (completedCount / totalGoals) * 100;
            if (completionRate >= 90) {
                events.push({ key: 'goal_master_supreme', value: completedCount });
            }
        }
        
        // Overachiever - 3 goals in one day
        const goalsCompletedToday = await this.getUserGoalsCompletedToday(userId);
        if (goalsCompletedToday >= 3) {
            events.push({ key: 'overachiever', value: goalsCompletedToday });
        }
        
        // Category master - goals in all categories
        const completedCategories = await this.getUserCompletedCategories(userId);
        if (completedCategories >= 6) {
            events.push({ key: 'category_master', value: completedCategories });
        }
        
        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackActiveGoalsCount(userId) {
        const activeGoalsCount = await this.getUserActiveGoalCount(userId);
        const activeCategoriesCount = await this.getUserActiveCategoriesCount(userId);
        
        const events = [
            { key: 'multitasker', value: activeGoalsCount },
            { key: 'balance_keeper', value: activeCategoriesCount }
        ];
        
        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackNoteWithLength(userId, noteLength) {
        const noteCount = await this.getUserNoteCount(userId);
        const goalNoteCount = await this.getUserUniqueGoalNoteCount(userId);
        
        const events = [
            { key: 'note_taker', value: noteCount },
            { key: 'reflection_master', value: goalNoteCount }
        ];
        
        // Storyteller - note with 500+ characters
        if (noteLength >= 500) {
            events.push({ key: 'storyteller', value: 1 });
        }
        
        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackSubscriptionUpgrade(userId) {
        const events = [
            { key: 'premium_pioneer', value: 1 }
        ];
        
        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackAIUsage(userId) {
        const aiUsageCount = await this.getUserAIUsageCount(userId);
        
        const events = [
            { key: 'ai_collaborator', value: aiUsageCount }
        ];
        
        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackDataExport(userId) {
        const exportCount = await this.getUserExportCount(userId);
        
        const events = [
            { key: 'data_analyst', value: exportCount }
        ];
        
        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackCommunityActivity(userId, activityType) {
        const events = [];
        
        if (activityType === 'post') {
            const postCount = await this.getUserCommunityPostCount(userId);
            events.push({ key: 'community_helper', value: postCount });
        } else if (activityType === 'like') {
            const likesReceived = await this.getUserLikesReceived(userId);
            events.push({ key: 'social_influencer', value: likesReceived });
        } else if (activityType === 'comment') {
            const commentsGiven = await this.getUserCommentsGiven(userId);
            events.push({ key: 'mentor', value: commentsGiven });
        }
        
        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackGoalArchived(userId) {
        // This can be used for comeback_kid when they reactivate
        return [];
    }

    static async trackGoalReactivated(userId) {
        const events = [
            { key: 'comeback_kid', value: 1 },
            { key: 'goal_recycler', value: 1 }
        ];
        
        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackMilestoneCompletedWithTiming(userId, milestoneData) {
        const milestoneCount = await this.getUserCompletedMilestoneCount(userId);
        const events = [
            { key: 'first_milestone', value: milestoneCount },
            { key: 'milestone_maniac', value: milestoneCount }
        ];
        
        // Efficiency expert - milestone ahead of schedule
        if (milestoneData.target_date) {
            const targetDate = new Date(milestoneData.target_date);
            const completedDate = new Date();
            if (completedDate < targetDate) {
                const aheadCount = await this.getUserMilestonesAheadOfSchedule(userId);
                events.push({ key: 'efficiency_expert', value: aheadCount });
            }
        }
        
        // Night owl - milestone completed after 11 PM
        const hour = new Date().getHours();
        if (hour >= 23 || hour < 6) {
            events.push({ key: 'night_owl', value: 1 });
        }
        
        return await this.trackMultipleAchievements(userId, events);
    }

    static async trackCheckInStreak(userId, checkInCount) {
        const events = [
            { key: 'detailed_tracker', value: checkInCount }
        ];
        
        // Yearly champion - 365 check-ins
        events.push({ key: 'yearly_champion', value: checkInCount });
        
        return await this.trackMultipleAchievements(userId, events);
    }

    // Helper methods for database queries
    static getUserGoalCount(userId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM goals WHERE user_id = ?', [userId], (err, row) => {
                if (err) {
                    console.warn('Error counting user goals:', err);
                    resolve(0);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    static getUserCompletedGoalCount(userId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM goals WHERE user_id = ? AND status = "completed"', [userId], (err, row) => {
                if (err) {
                    console.warn('Error counting completed goals:', err);
                    resolve(0);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    static getUserCompletedGoalCountByCategory(userId, category) {
        return new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM goals WHERE user_id = ? AND status = "completed" AND category = ?', 
                [userId, category], (err, row) => {
                if (err) {
                    console.warn('Error counting completed goals by category:', err);
                    resolve(0);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    static getUserCompletedMilestoneCount(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT COUNT(*) as count 
                FROM milestones m 
                JOIN goals g ON m.goal_id = g.id 
                WHERE g.user_id = ? AND m.status = "completed"
            `;
            db.get(query, [userId], (err, row) => {
                if (err) {
                    console.warn('Error counting completed milestones:', err);
                    resolve(0);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    static getUserNoteCount(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT COUNT(*) as count 
                FROM goal_notes gn 
                JOIN goals g ON gn.goal_id = g.id 
                WHERE g.user_id = ?
            `;
            db.get(query, [userId], (err, row) => {
                if (err) {
                    console.warn('Error counting user notes:', err);
                    resolve(0);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    static getUserUniqueGoalNoteCount(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT COUNT(DISTINCT gn.goal_id) as count 
                FROM goal_notes gn 
                JOIN goals g ON gn.goal_id = g.id 
                WHERE g.user_id = ?
            `;
            db.get(query, [userId], (err, row) => {
                if (err) {
                    console.warn('Error counting unique goal notes:', err);
                    resolve(0);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    static getUserLogCount(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT COUNT(*) as count 
                FROM goal_logs gl 
                JOIN goals g ON gl.goal_id = g.id 
                WHERE g.user_id = ?
            `;
            db.get(query, [userId], (err, row) => {
                if (err) {
                    console.warn('Error counting user logs:', err);
                    resolve(0);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    static getUserMoodLogCount(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT COUNT(*) as count 
                FROM goal_logs gl 
                JOIN goals g ON gl.goal_id = g.id 
                WHERE g.user_id = ? AND gl.mood IS NOT NULL AND gl.mood != ''
            `;
            db.get(query, [userId], (err, row) => {
                if (err) {
                    console.warn('Error counting mood logs:', err);
                    resolve(0);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    static getUserWeekendLogins(userId) {
        return new Promise((resolve, reject) => {
            // Simplified - assume they login on weekends if they have weekend goals activity
            db.get(`SELECT COUNT(*) as count FROM goals WHERE user_id = ? 
                    AND strftime('%w', created_at) IN ('0', '6')`, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
    }

    static getUserGoalsCompletedToday(userId) {
        return new Promise((resolve, reject) => {
            const today = new Date().toISOString().split('T')[0];
            db.get(`SELECT COUNT(*) as count FROM goals 
                    WHERE user_id = ? AND status = 'completed' 
                    AND DATE(updated_at) = ?`, [userId, today], (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
    }

    static getUserCompletedCategories(userId) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT COUNT(DISTINCT category) as count FROM goals 
                    WHERE user_id = ? AND status = 'completed' AND category IS NOT NULL`, 
                [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
    }

    static getUserAIUsageCount(userId) {
        return new Promise((resolve, reject) => {
            // Track AI usage - for now use goal count as proxy
            db.get('SELECT COUNT(*) as count FROM goals WHERE user_id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(Math.floor(row.count / 2)); // Simulate AI usage
            });
        });
    }

    static getUserExportCount(userId) {
        return new Promise((resolve, reject) => {
            // Track exports - for now use completed goals as proxy
            db.get(`SELECT COUNT(*) as count FROM goals 
                    WHERE user_id = ? AND status = 'completed'`, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(Math.floor(row.count / 5)); // Simulate exports
            });
        });
    }

    static getUserCommunityPostCount(userId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM posts WHERE user_id = ?', [userId], (err, row) => {
                if (err) {
                    // Table might not exist, return 0
                    console.warn('Posts table not found, returning 0 for community post count');
                    resolve(0);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    static getUserLikesReceived(userId) {
        return new Promise((resolve, reject) => {
            const query = `SELECT COUNT(*) as count FROM post_likes pl
                          JOIN posts p ON pl.post_id = p.id 
                          WHERE p.user_id = ?`;
            db.get(query, [userId], (err, row) => {
                if (err) {
                    // Table might not exist, return 0
                    console.warn('Post_likes table not found, returning 0 for likes received');
                    resolve(0);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    static getUserCommentsGiven(userId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM post_comments WHERE user_id = ?', [userId], (err, row) => {
                if (err) {
                    // Table might not exist, return 0
                    console.warn('Post_comments table not found, returning 0 for comments given');
                    resolve(0);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    static getUserMilestonesAheadOfSchedule(userId) {
        return new Promise((resolve, reject) => {
            const query = `SELECT COUNT(*) as count FROM milestones m
                          JOIN goals g ON m.goal_id = g.id
                          WHERE g.user_id = ? AND m.status = 'completed' 
                          AND m.completed_at IS NOT NULL AND DATE(m.completed_at) < DATE(m.target_date)`;
            db.get(query, [userId], (err, row) => {
                if (err) {
                    console.warn('Error counting milestones ahead of schedule:', err);
                    resolve(0);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    static getUserActiveGoalCount(userId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM goals WHERE user_id = ? AND status = "active"', 
                [userId], (err, row) => {
                if (err) {
                    console.warn('Error counting active goals:', err);
                    resolve(0);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    static getUserActiveCategoriesCount(userId) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT COUNT(DISTINCT category) as count FROM goals 
                    WHERE user_id = ? AND status = 'active' AND category IS NOT NULL`, 
                [userId], (err, row) => {
                if (err) {
                    console.warn('Error counting active categories:', err);
                    resolve(0);
                } else {
                    resolve(row.count);
                }
            });
        });
    }
}

module.exports = AchievementTracker; 