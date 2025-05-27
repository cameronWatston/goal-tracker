const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const db = require('../db/init');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Middleware to ensure user is authenticated
const ensureAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    return res.status(401).json({ error: 'Authentication required' });
};

// Middleware to ensure user is a paid subscriber
const ensurePaidSubscriber = (req, res, next) => {
    if (req.session.user && (req.session.user.subscription_plan === 'monthly' || req.session.user.subscription_plan === 'annual')) {
        return next();
    }
    return res.status(403).json({ error: 'Pro subscription required', upgrade: true });
};

// Community Search API
router.get('/community/search', ensureAuthenticated, async (req, res) => {
    try {
        const { q: query, filter = 'all' } = req.query;
        
        if (!query || query.trim().length < 2) {
            return res.json({ results: [], count: 0 });
        }
        
        const searchQuery = query.trim();
        let results = [];
        
        // Search based on filter type
        switch (filter) {
            case 'hashtags':
                results = await searchHashtags(searchQuery);
                break;
            case 'users':
                results = await searchUsers(searchQuery);
                break;
            case 'goals':
                results = await searchGoals(searchQuery, req.session.user.id);
                break;
            case 'all':
            default:
                const [posts, hashtags, users, goals] = await Promise.all([
                    searchPosts(searchQuery),
                    searchHashtags(searchQuery),
                    searchUsers(searchQuery),
                    searchGoals(searchQuery, req.session.user.id)
                ]);
                results = [...posts, ...hashtags, ...users, ...goals];
                break;
        }
        
        res.json({
            results: results.slice(0, 20), // Limit to 20 results
            count: results.length
        });
        
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Search functions
async function searchPosts(query) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                posts.id,
                posts.title,
                posts.content,
                users.username,
                posts.created_at,
                (SELECT COUNT(*) FROM post_likes WHERE post_likes.post_id = posts.id) as like_count
            FROM posts
            JOIN users ON posts.user_id = users.id
            WHERE posts.title LIKE ? OR posts.content LIKE ?
            ORDER BY posts.created_at DESC
            LIMIT 10
        `;
        
        const searchTerm = `%${query}%`;
        db.all(sql, [searchTerm, searchTerm], (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            
            const results = rows.map(post => ({
                type: 'post',
                id: post.id,
                title: post.title,
                description: post.content.length > 100 ? post.content.substring(0, 100) + '...' : post.content,
                meta: [
                    `by ${post.username}`,
                    `${post.like_count} likes`,
                    new Date(post.created_at).toLocaleDateString()
                ]
            }));
            
            resolve(results);
        });
    });
}

async function searchHashtags(query) {
    return new Promise((resolve, reject) => {
        // Extract hashtag from query if it starts with #
        const hashtag = query.startsWith('#') ? query.substring(1) : query;
        
        const sql = `
            SELECT content
            FROM posts
            WHERE content LIKE ?
        `;
        
        db.all(sql, [`%#${hashtag}%`], (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            
            // Extract hashtags from content and count them
            const hashtagCounts = {};
            rows.forEach(row => {
                const hashtags = row.content.match(/#\w+/g) || [];
                hashtags.forEach(tag => {
                    const lowerTag = tag.toLowerCase();
                    if (lowerTag.includes(hashtag.toLowerCase())) {
                        hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
                    }
                });
            });
            
            // Convert to results array
            const results = Object.entries(hashtagCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([tag, count]) => ({
                    type: 'hashtag',
                    id: tag.substring(1), // Remove # for ID
                    title: tag,
                    description: `Used in ${count} post${count !== 1 ? 's' : ''}`,
                    meta: [`${count} posts`]
                }));
            
            resolve(results);
        });
    });
}

async function searchUsers(query) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                users.id,
                users.username,
                COUNT(posts.id) as post_count,
                users.subscription_plan
            FROM users
            LEFT JOIN posts ON users.id = posts.user_id
            WHERE users.username LIKE ?
            GROUP BY users.id, users.username, users.subscription_plan
            ORDER BY post_count DESC
            LIMIT 5
        `;
        
        db.all(sql, [`%${query}%`], (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            
            const results = rows.map(user => ({
                type: 'user',
                id: user.id,
                title: user.username,
                description: `${user.post_count} post${user.post_count !== 1 ? 's' : ''}`,
                meta: [
                    `${user.post_count} posts`,
                    user.subscription_plan && user.subscription_plan !== 'free' ? 'Pro Member' : 'Free Member'
                ]
            }));
            
            resolve(results);
        });
    });
}

async function searchGoals(query, userId) {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                id,
                title,
                description,
                status,
                target_date
            FROM goals
            WHERE user_id = ? AND (title LIKE ? OR description LIKE ?)
            ORDER BY created_at DESC
            LIMIT 5
        `;
        
        const searchTerm = `%${query}%`;
        db.all(sql, [userId, searchTerm, searchTerm], (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            
            const results = rows.map(goal => ({
                type: 'goal',
                id: goal.id,
                title: goal.title,
                description: goal.description ? (goal.description.length > 100 ? goal.description.substring(0, 100) + '...' : goal.description) : 'No description',
                meta: [
                    `Status: ${goal.status}`,
                    goal.target_date ? `Due: ${new Date(goal.target_date).toLocaleDateString()}` : 'No due date'
                ]
            }));
            
            resolve(results);
        });
    });
}

// AI Chat API
router.post('/ai/chat', ensureAuthenticated, ensurePaidSubscriber, async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        if (message.length > 500) {
            return res.status(400).json({ error: 'Message too long (max 500 characters)' });
        }
        
        // Get user's goals for context
        const userGoals = await new Promise((resolve, reject) => {
            db.all(
                'SELECT title, description, status, target_date FROM goals WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
                [req.session.user.id],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                }
            );
        });
        
        let aiResponse;
        
        // Check if OpenAI is available
        if (process.env.OPENAI_API_KEY && openai) {
            try {
                // Create context-aware prompt
                const systemPrompt = `You are a Goal Assistant AI for a goal tracking app. You help users with:
- Creating SMART (Specific, Measurable, Achievable, Relevant, Time-bound) goals
- Breaking down large goals into smaller milestones
- Providing motivation and accountability tips
- Overcoming obstacles and challenges
- Time management and productivity advice

User's current goals: ${userGoals.length > 0 ? userGoals.map(g => `"${g.title}" (${g.status})`).join(', ') : 'No current goals'}

Keep responses helpful, encouraging, and under 200 words. Be specific and actionable.`;

                const completion = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: message }
                    ],
                    max_tokens: 300,
                    temperature: 0.7
                });
                
                aiResponse = completion.choices[0].message.content.trim();
            } catch (openaiError) {
                console.error('OpenAI API error:', openaiError);
                // Fall back to smart responses
                aiResponse = generateSmartResponse(message, userGoals);
            }
        } else {
            // Generate smart fallback responses
            aiResponse = generateSmartResponse(message, userGoals);
        }
        
        res.json({
            success: true,
            response: aiResponse
        });
        
    } catch (error) {
        console.error('AI Chat error:', error);
        res.status(500).json({ 
            error: 'AI service temporarily unavailable. Please try again later.' 
        });
    }
});

// Smart response generator for when OpenAI is not available
function generateSmartResponse(message, userGoals) {
    const lowerMessage = message.toLowerCase();
    
    // Goal-related responses
    if (lowerMessage.includes('goal') || lowerMessage.includes('target')) {
        if (userGoals.length === 0) {
            return "I see you're interested in setting goals! 🎯 Here's my advice: Start with one specific, measurable goal. For example, instead of 'get fit,' try 'exercise 30 minutes, 3 times per week.' What area of your life would you like to focus on first?";
        } else {
            const activeGoals = userGoals.filter(g => g.status === 'active').length;
            return `Great question about goals! 💪 I see you have ${activeGoals} active goals. Remember: focus on progress, not perfection. Break your goals into smaller weekly milestones. Which goal would you like to work on today?`;
        }
    }
    
    // Motivation responses
    if (lowerMessage.includes('motivat') || lowerMessage.includes('stuck') || lowerMessage.includes('hard')) {
        return "I understand it can be challenging! 🌟 Here's what I recommend: 1) Celebrate small wins - every step counts! 2) Review your 'why' - remember what motivated you to start. 3) Break tasks into 5-minute chunks. You've got this! What's one small action you can take today?";
    }
    
    // Planning responses
    if (lowerMessage.includes('plan') || lowerMessage.includes('how') || lowerMessage.includes('start')) {
        return "Excellent planning mindset! 📋 Here's my SMART approach: 1) Be Specific about what you want. 2) Make it Measurable. 3) Ensure it's Achievable. 4) Keep it Relevant to your life. 5) Set a Timeline. What specific outcome are you aiming for?";
    }
    
    // Progress responses
    if (lowerMessage.includes('progress') || lowerMessage.includes('track')) {
        return "Tracking progress is key to success! 📊 I recommend: 1) Daily check-ins (even 2 minutes helps). 2) Weekly reviews of what worked. 3) Monthly goal adjustments. 4) Celebrate milestones! What progress have you made recently that you're proud of?";
    }
    
    // Time management
    if (lowerMessage.includes('time') || lowerMessage.includes('busy') || lowerMessage.includes('schedule')) {
        return "Time management is crucial for goal success! ⏰ Try these strategies: 1) Time-block your goals into your calendar. 2) Use the 'two-minute rule' - if it takes less than 2 minutes, do it now. 3) Batch similar tasks. 4) Protect your focus time. What's your biggest time challenge?";
    }
    
    // Default helpful response
    const responses = [
        "That's a great question! 🎯 I'm here to help you achieve your goals. Could you tell me more about what specific challenge you're facing?",
        "I'd love to help you with that! 💪 Goal achievement is all about breaking things down into manageable steps. What's your main focus right now?",
        "Interesting! 🌟 Let's work together to find a solution. Could you share more details about what you're trying to accomplish?",
        "I'm excited to help you succeed! 🚀 The key to any goal is having a clear plan and taking consistent action. What would you like to explore first?"
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
}

// Notifications API
router.get('/notifications', ensureAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    
    db.all(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
        [userId],
        (err, notifications) => {
            if (err) {
                console.error('Error fetching notifications:', err);
                return res.status(500).json({ error: 'Failed to fetch notifications' });
            }
            
            res.json({
                success: true,
                notifications: notifications,
                unreadCount: notifications.filter(n => !n.is_read).length
            });
        }
    );
});

// Mark notification as read
router.post('/notifications/:id/read', ensureAuthenticated, (req, res) => {
    const notificationId = req.params.id;
    const userId = req.session.user.id;
    
    db.run(
        'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
        [notificationId, userId],
        (err) => {
            if (err) {
                console.error('Error marking notification as read:', err);
                return res.status(500).json({ error: 'Failed to mark notification as read' });
            }
            
            res.json({ success: true });
        }
    );
});

// Mark all notifications as read
router.post('/notifications/mark-all-read', ensureAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    
    db.run(
        'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
        [userId],
        (err) => {
            if (err) {
                console.error('Error marking all notifications as read:', err);
                return res.status(500).json({ error: 'Failed to mark all notifications as read' });
            }
            
            res.json({ success: true });
        }
    );
});

// Get user stats for navbar dropdown
router.get('/user/stats', ensureAuthenticated, async (req, res) => {
    const userId = req.session.user.id;
    
    try {
        // Get goals count
        const goalResult = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM goals WHERE user_id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        // Get completed goals count for success rate
        const completedResult = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM goals WHERE user_id = ? AND status = "completed"', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        // Calculate success rate
        const successRate = goalResult.count > 0 ? Math.round((completedResult.count / goalResult.count) * 100) : 0;
        
        // Get real streak data using StreakTracker
        const StreakTracker = require('../utils/streak-tracker');
        const streakStats = await StreakTracker.getUserStreakStats(userId);
        
        res.json({
            goals: goalResult.count,
            successRate: successRate,
            streak: streakStats.currentStreak,
            longestStreak: streakStats.longestStreak,
            totalActiveDays: streakStats.totalActiveDays
        });
        
    } catch (error) {
        console.error('Error getting user stats:', error);
        res.json({ 
            goals: 0, 
            successRate: 0, 
            streak: 0, 
            longestStreak: 0, 
            totalActiveDays: 0 
        });
    }
});

// Get user goals for goal insights
router.get('/goals', ensureAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    
    db.all(
        'SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err, goals) => {
            if (err) {
                console.error('Error fetching goals:', err);
                return res.status(500).json({ error: 'Failed to fetch goals' });
            }
            
            // Return goals array for the goal insights to process
            res.json(goals || []);
        }
    );
});

// Create new goal with AI milestones
router.post('/goals', ensureAuthenticated, async (req, res) => {
    try {
        const { title, description, category, startDate, targetDate } = req.body;
        const userId = req.session.user.id;
        
        // Validate required fields
        if (!title || !category || !startDate || !targetDate) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Validate dates
        const start = new Date(startDate);
        const target = new Date(targetDate);
        if (start >= target) {
            return res.status(400).json({ error: 'Start date must be before target date' });
        }
        
        // Create the goal first
        const goalId = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO goals (user_id, title, description, category, status, start_date, target_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [userId, title, description || '', category, 'active', startDate, targetDate, new Date().toISOString()],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });
        
        // Get user subscription plan
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT subscription_plan FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        // Generate milestones based on subscription plan
        const isPremium = user && (user.subscription_plan === 'monthly' || user.subscription_plan === 'annual');
        let milestones = [];
        
        try {
            if (isPremium) {
                // Use AI service for premium users
                const aiService = require('../utils/aiService');
                milestones = await aiService.generateMilestones(title, description, startDate, targetDate, category, user.subscription_plan);
            } else {
                // Generate basic milestones for free users
                milestones = generateBasicMilestones(title, startDate, targetDate);
            }
        } catch (error) {
            console.error('Error generating milestones:', error);
            // Fallback to basic milestones
            milestones = generateBasicMilestones(title, startDate, targetDate);
        }
        
        // Insert milestones
        for (const milestone of milestones) {
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO milestones (goal_id, title, description, due_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [goalId, milestone.title, milestone.description || '', milestone.due_date, 'pending', new Date().toISOString()],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }
        
        res.json({
            success: true,
            goalId: goalId,
            redirectUrl: `/goals/detail/${goalId}`,
            message: 'Goal created successfully!'
        });
        
    } catch (error) {
        console.error('Error creating goal:', error);
        res.status(500).json({ error: 'Failed to create goal' });
    }
});

// Generate basic milestones for free users
function generateBasicMilestones(title, startDate, targetDate) {
    const start = new Date(startDate);
    const target = new Date(targetDate);
    const totalDays = Math.ceil((target - start) / (1000 * 60 * 60 * 24));
    
    const milestones = [];
    const milestoneCount = 6; // Basic 6 milestones
    
    for (let i = 1; i <= milestoneCount; i++) {
        const daysOffset = Math.ceil((totalDays / milestoneCount) * i);
        const milestoneDate = new Date(start);
        milestoneDate.setDate(milestoneDate.getDate() + daysOffset);
        
        // Ensure milestone date doesn't exceed target date
        if (milestoneDate > target) {
            milestoneDate.setTime(target.getTime());
        }
        
        milestones.push({
            title: `Milestone ${i}: Progress Check`,
            description: `Review your progress towards "${title}" and adjust your strategy if needed.`,
            due_date: milestoneDate.toISOString().split('T')[0]
        });
    }
    
    return milestones;
}

// Helper function to create notifications
function createNotification(userId, type, title, message, icon = '🔔', actionUrl = null) {
    db.run(
        'INSERT INTO notifications (user_id, type, title, message, icon, action_url) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, type, title, message, icon, actionUrl],
        (err) => {
            if (err) {
                console.error('Error creating notification:', err);
            }
        }
    );
}

// Create sample notifications for new users (optional endpoint for testing)
router.post('/create-sample-notifications', ensureAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    
    // Check if user already has notifications
    db.get('SELECT COUNT(*) as count FROM notifications WHERE user_id = ?', [userId], (err, result) => {
        if (err || result.count > 0) {
            return res.json({ message: 'User already has notifications or error occurred' });
        }
        
        // Create sample notifications
        const sampleNotifications = [
            {
                type: 'welcome',
                title: 'Welcome to Goal Tracker! 🎉',
                message: 'Start by creating your first goal and sharing your progress with the community.',
                icon: '🎯',
                actionUrl: '/dashboard'
            },
            {
                type: 'tip',
                title: 'Pro Tip: Use Hashtags! 📝',
                message: 'Add hashtags like #fitness #productivity to your posts to connect with like-minded users.',
                icon: '💡',
                actionUrl: '/community'
            },
            {
                type: 'feature',
                title: 'Try the AI Assistant! 🤖',
                message: 'Upgrade to Pro to get personalized goal advice and motivation from our AI assistant.',
                icon: '🚀',
                actionUrl: '/subscription'
            }
        ];
        
        sampleNotifications.forEach((notification, index) => {
            setTimeout(() => {
                createNotification(
                    userId,
                    notification.type,
                    notification.title,
                    notification.message,
                    notification.icon,
                    notification.actionUrl
                );
            }, index * 100);
        });
        
        res.json({ message: 'Sample notifications created!' });
    });
});

// Get user achievements
router.get('/achievements', ensureAuthenticated, async (req, res) => {
    try {
        const AchievementTracker = require('../utils/achievements');
        const userId = req.session.user.id;
        
        // Get user achievements and stats
        const [achievements, stats] = await Promise.all([
            AchievementTracker.getUserAchievements(userId),
            AchievementTracker.getUserAchievementStats(userId)
        ]);
        
        res.json({
            success: true,
            achievements: achievements,
            stats: stats
        });
        
    } catch (error) {
        console.error('Error fetching achievements:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to load achievements' 
        });
    }
});

// Clear all notifications for a user
router.post('/notifications/clear-all', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const userId = req.session.user.id;
    
    db.run('DELETE FROM notifications WHERE user_id = ?', [userId], function(err) {
        if (err) {
            console.error('Error clearing all notifications:', err);
            return res.status(500).json({ success: false, error: 'Failed to clear notifications' });
        }
        
        res.json({ 
            success: true, 
            message: 'All notifications cleared',
            deletedCount: this.changes 
        });
    });
});

// Delete a specific notification
router.delete('/notifications/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const userId = req.session.user.id;
    const notificationId = req.params.id;
    
    // Verify the notification belongs to the user before deleting
    db.run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [notificationId, userId], function(err) {
        if (err) {
            console.error('Error deleting notification:', err);
            return res.status(500).json({ success: false, error: 'Failed to delete notification' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }
        
        res.json({ 
            success: true, 
            message: 'Notification deleted',
            deletedCount: this.changes 
        });
    });
});

// Get unread notification count for navbar badge
router.get('/notifications/unread-count', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const userId = req.session.user.id;
    
    db.get('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [userId], (err, row) => {
        if (err) {
            console.error('Error getting unread notification count:', err);
            return res.status(500).json({ success: false, error: 'Failed to get notification count' });
        }
        
        res.json({ 
            success: true, 
            count: row.count,
            hasUnread: row.count > 0
        });
    });
});

// Get recent notifications for dropdown
router.get('/notifications/recent', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const userId = req.session.user.id;
    const limit = parseInt(req.query.limit) || 5;
    
    db.all(`SELECT * FROM notifications 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?`, [userId, limit], (err, notifications) => {
        if (err) {
            console.error('Error getting recent notifications:', err);
            return res.status(500).json({ success: false, error: 'Failed to get notifications' });
        }
        
        res.json({ 
            success: true, 
            notifications: notifications || []
        });
    });
});

// Mark a specific notification as read
router.post('/notifications/:id/mark-read', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const userId = req.session.user.id;
    const notificationId = req.params.id;
    
    db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', 
        [notificationId, userId], function(err) {
        if (err) {
            console.error('Error marking notification as read:', err);
            return res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
        }
        
        res.json({ 
            success: true, 
            message: 'Notification marked as read',
            updated: this.changes > 0
        });
    });
});

// Get single goal for editing
router.get('/goals/:id', ensureAuthenticated, (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    
    db.get(
        'SELECT * FROM goals WHERE id = ? AND user_id = ?',
        [goalId, userId],
        (err, goal) => {
            if (err) {
                console.error('Error fetching goal:', err);
                return res.status(500).json({ error: 'Failed to fetch goal' });
            }
            
            if (!goal) {
                return res.status(404).json({ error: 'Goal not found' });
            }
            
            res.json(goal);
        }
    );
});

// Update goal
router.put('/goals/:id', ensureAuthenticated, (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    const { title, description, category, startDate, targetDate, status } = req.body;
    
    // Validate required fields
    if (!title || !category || !startDate || !targetDate || !status) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate dates
    const start = new Date(startDate);
    const target = new Date(targetDate);
    if (start >= target) {
        return res.status(400).json({ error: 'Start date must be before target date' });
    }
    
    db.run(
        'UPDATE goals SET title = ?, description = ?, category = ?, start_date = ?, target_date = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        [title, description || '', category, startDate, targetDate, status, new Date().toISOString(), goalId, userId],
        function(err) {
            if (err) {
                console.error('Error updating goal:', err);
                return res.status(500).json({ error: 'Failed to update goal' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Goal not found' });
            }
            
            res.json({
                success: true,
                message: 'Goal updated successfully!'
            });
        }
    );
});

// Delete goal
router.delete('/goals/:id', ensureAuthenticated, (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    
    // Delete milestones first (due to foreign key constraint)
    db.run('DELETE FROM milestones WHERE goal_id = ?', [goalId], (err) => {
        if (err) {
            console.error('Error deleting milestones:', err);
            return res.status(500).json({ error: 'Failed to delete goal milestones' });
        }
        
        // Then delete the goal
        db.run(
            'DELETE FROM goals WHERE id = ? AND user_id = ?',
            [goalId, userId],
            function(err) {
                if (err) {
                    console.error('Error deleting goal:', err);
                    return res.status(500).json({ error: 'Failed to delete goal' });
                }
                
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Goal not found' });
                }
                
                res.json({
                    success: true,
                    message: 'Goal deleted successfully!'
                });
            }
        );
    });
});

// ======================== MISSING API ENDPOINTS ========================

// AI Generate Milestones for Dashboard
router.post('/ai/generate-milestones', ensureAuthenticated, async (req, res) => {
    try {
        const { title, description, category, deadline } = req.body;
        const userId = req.session.user.id;
        
        if (!title || !deadline) {
            return res.status(400).json({ error: 'Title and deadline are required' });
        }
        
        // Get user subscription plan
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT subscription_plan FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        const isPremium = user && (user.subscription_plan === 'monthly' || user.subscription_plan === 'annual');
        let milestones = [];
        
        if (isPremium) {
            try {
                const aiService = require('../utils/aiService');
                const today = new Date().toISOString().split('T')[0];
                milestones = await aiService.generateMilestones(title, description, today, deadline, category, user.subscription_plan);
            } catch (error) {
                console.error('Error generating AI milestones:', error);
                milestones = generateBasicMilestones(title, new Date().toISOString().split('T')[0], deadline);
            }
        } else {
            milestones = generateBasicMilestones(title, new Date().toISOString().split('T')[0], deadline);
        }
        
        res.json({
            success: true,
            milestones: milestones
        });
        
    } catch (error) {
        console.error('Error in generate-milestones:', error);
        res.status(500).json({ error: 'Failed to generate milestones' });
    }
});

// Create Goal with Milestones from Dashboard
router.post('/goals/create-with-milestones', ensureAuthenticated, async (req, res) => {
    try {
        const { title, description, category, targetDate, milestones } = req.body;
        const userId = req.session.user.id;
        
        if (!title || !category || !targetDate) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const startDate = new Date().toISOString().split('T')[0];
        
        // Create the goal
        const goalId = await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO goals (user_id, title, description, category, status, start_date, target_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [userId, title, description || '', category, 'active', startDate, targetDate, new Date().toISOString()],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        
        // Insert milestones if provided
        if (milestones && Array.isArray(milestones)) {
            for (let i = 0; i < milestones.length; i++) {
                const milestone = milestones[i];
                await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO milestones (goal_id, title, description, target_date, status, display_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [goalId, milestone.title, milestone.description || '', milestone.targetDate || targetDate, 'pending', i + 1, new Date().toISOString()],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }
        }
        
        res.json({
            success: true,
            goalId: goalId,
            message: 'Goal created successfully with milestones!'
        });
        
    } catch (error) {
        console.error('Error creating goal with milestones:', error);
        res.status(500).json({ error: 'Failed to create goal' });
    }
});

// Get Goal Progress for Dashboard Cards
router.get('/goals/:id/progress', ensureAuthenticated, (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    
    // Verify goal ownership
    db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, goal) => {
        if (err || !goal) {
            return res.status(404).json({ error: 'Goal not found' });
        }
        
        // Get milestones for this goal
        db.all('SELECT * FROM milestones WHERE goal_id = ?', [goalId], (err, milestones) => {
            if (err) {
                console.error('Error fetching milestones:', err);
                return res.status(500).json({ error: 'Failed to fetch milestones' });
            }
            
            const totalMilestones = milestones.length;
            const completedMilestones = milestones.filter(m => m.status === 'completed').length;
            const progress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
            
            res.json({
                success: true,
                progress: progress,
                milestoneCount: totalMilestones,
                completedCount: completedMilestones
            });
        });
    });
});

// Get Goal Details for Modal
router.get('/goals/:id/details', ensureAuthenticated, (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    
    // Get goal with milestones
    db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, goal) => {
        if (err || !goal) {
            return res.status(404).json({ error: 'Goal not found' });
        }
        
        db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY display_order ASC, target_date ASC', [goalId], (err, milestones) => {
            if (err) {
                console.error('Error fetching milestones:', err);
                milestones = [];
            }
            
            // Calculate overall progress
            const totalMilestones = milestones.length;
            const completedMilestones = milestones.filter(m => m.status === 'completed').length;
            const progress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
            
            goal.milestones = milestones;
            goal.progress = progress;
            
            res.json({
                success: true,
                goal: goal
            });
        });
    });
});

// Get User Streak for Dashboard
router.get('/user/streak', ensureAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const StreakTracker = require('../utils/streak-tracker');
        const streakStats = await StreakTracker.getUserStreakStats(userId);
        
        res.json({
            success: true,
            streak: streakStats.currentStreak || 0
        });
    } catch (error) {
        console.error('Error getting user streak:', error);
        res.json({
            success: true,
            streak: 0
        });
    }
});

// Get Milestone Count for Dashboard
router.get('/milestones/count', ensureAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    
    db.get(`
        SELECT COUNT(m.id) as total 
        FROM milestones m 
        JOIN goals g ON m.goal_id = g.id 
        WHERE g.user_id = ?
    `, [userId], (err, result) => {
        if (err) {
            console.error('Error getting milestone count:', err);
            return res.json({ success: true, total: 0 });
        }
        
        res.json({
            success: true,
            total: result.total || 0
        });
    });
});

// Get Analytics for Premium Dashboard
router.get('/analytics/dashboard', ensureAuthenticated, ensurePaidSubscriber, (req, res) => {
    const userId = req.session.user.id;
    
    // Get goals data for chart
    db.all(`
        SELECT 
            DATE(created_at) as date,
            COUNT(*) as goals_created,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as goals_completed
        FROM goals 
        WHERE user_id = ? 
        AND created_at >= date('now', '-30 days')
        GROUP BY DATE(created_at)
        ORDER BY date ASC
    `, [userId], (err, chartData) => {
        if (err) {
            console.error('Error getting analytics data:', err);
            return res.status(500).json({ error: 'Failed to load analytics' });
        }
        
        // Format data for Chart.js
        const labels = [];
        const progress = [];
        
        // Fill in missing dates and calculate cumulative progress
        const last30Days = [];
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            last30Days.push(date.toISOString().split('T')[0]);
        }
        
        let cumulativeProgress = 0;
        last30Days.forEach(date => {
            const dayData = chartData.find(d => d.date === date);
            if (dayData) {
                cumulativeProgress += (dayData.goals_completed * 10); // 10 points per completed goal
            }
            labels.push(new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            progress.push(Math.min(cumulativeProgress, 100));
        });
        
        res.json({
            success: true,
            chartData: {
                labels: labels,
                progress: progress
            },
            insights: {
                trend: 'positive',
                message: 'Your goal completion rate is improving!'
            }
        });
    });
});

// AI Insights for Goal Detail Page
router.get('/ai/insights', ensureAuthenticated, (req, res) => {
    const { goalId } = req.query;
    const userId = req.session.user.id;
    
    if (!goalId) {
        return res.status(400).json({ error: 'Goal ID is required' });
    }
    
    // Get goal and milestone data
    db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, goal) => {
        if (err || !goal) {
            return res.status(404).json({ error: 'Goal not found' });
        }
        
        db.all('SELECT * FROM milestones WHERE goal_id = ?', [goalId], (err, milestones) => {
            if (err) {
                console.error('Error fetching milestones:', err);
                milestones = [];
            }
            
            // Generate insights based on goal data
            const totalMilestones = milestones.length;
            const completedMilestones = milestones.filter(m => m.status === 'completed').length;
            const progress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
            
            const targetDate = new Date(goal.target_date);
            const today = new Date();
            const daysRemaining = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
            
            let insight = '';
            let recommendation = '';
            
            if (progress >= 80) {
                insight = "🎉 Excellent progress! You're in the final stretch.";
                recommendation = "Focus on completing the remaining milestones to achieve your goal.";
            } else if (progress >= 50) {
                insight = "💪 Great momentum! You're halfway there.";
                recommendation = "Keep up the consistent effort. Consider breaking down larger milestones.";
            } else if (progress >= 25) {
                insight = "🌱 Good start! You're building momentum.";
                recommendation = "Try to complete at least one milestone this week to maintain progress.";
            } else {
                insight = "🚀 Ready to accelerate? Every journey starts with a single step.";
                recommendation = "Focus on completing your first milestone to build momentum.";
            }
            
            if (daysRemaining < 7 && progress < 80) {
                insight = "⏰ Time is running short! Consider adjusting your timeline or scope.";
                recommendation = "Prioritize the most important milestones or extend your deadline.";
            }
            
            res.json({
                success: true,
                data: {
                    insight: insight,
                    recommendation: recommendation,
                    progress: progress,
                    daysRemaining: daysRemaining,
                    completedMilestones: completedMilestones,
                    totalMilestones: totalMilestones
                }
            });
        });
    });
});

// Get Motivational Quote
router.get('/motivation/quote', ensureAuthenticated, (req, res) => {
    const quotes = [
        {
            text: "The journey of a thousand miles begins with one step.",
            author: "Lao Tzu"
        },
        {
            text: "Success is not final, failure is not fatal: it is the courage to continue that counts.",
            author: "Winston Churchill"
        },
        {
            text: "The only impossible journey is the one you never begin.",
            author: "Tony Robbins"
        },
        {
            text: "Don't watch the clock; do what it does. Keep going.",
            author: "Sam Levenson"
        },
        {
            text: "The future belongs to those who believe in the beauty of their dreams.",
            author: "Eleanor Roosevelt"
        },
        {
            text: "It is during our darkest moments that we must focus to see the light.",
            author: "Aristotle"
        },
        {
            text: "Success is walking from failure to failure with no loss of enthusiasm.",
            author: "Winston Churchill"
        },
        {
            text: "The only way to do great work is to love what you do.",
            author: "Steve Jobs"
        },
        {
            text: "Life is what happens to you while you're busy making other plans.",
            author: "John Lennon"
        },
        {
            text: "The way to get started is to quit talking and begin doing.",
            author: "Walt Disney"
        }
    ];
    
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    
    res.json({
        success: true,
        quote: randomQuote.text,
        author: randomQuote.author
    });
});

// AI Motivation for Goal Detail Page
router.post('/ai/motivation', ensureAuthenticated, (req, res) => {
    const { goalId } = req.body;
    const userId = req.session.user.id;
    
    if (!goalId) {
        return res.status(400).json({ error: 'Goal ID is required' });
    }
    
    // Get goal data for context
    db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, goal) => {
        if (err || !goal) {
            return res.status(404).json({ error: 'Goal not found' });
        }
        
        const motivationalMessages = [
            `🌟 Remember why you started "${goal.title}" - your future self will thank you for not giving up!`,
            `💪 Every step toward "${goal.title}" is progress worth celebrating. You've got this!`,
            `🚀 "${goal.title}" might seem challenging now, but you're stronger than you think!`,
            `✨ Focus on the journey, not just the destination. You're already succeeding with "${goal.title}"!`,
            `🎯 Small consistent actions toward "${goal.title}" lead to extraordinary results!`,
            `🔥 Your determination today creates your success tomorrow. Stay fired up about "${goal.title}"!`,
            `⭐ Every expert was once a beginner. You're building expertise with "${goal.title}" every day!`,
            `🌈 Challenges are just opportunities in disguise. "${goal.title}" is making you stronger!`
        ];
        
        const randomMessage = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
        
        res.json({
            success: true,
            message: randomMessage
        });
    });
});

module.exports = router; 