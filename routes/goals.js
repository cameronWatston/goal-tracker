const express = require('express');
const router = express.Router();
const db = require('../db/init');
const aiService = require('../utils/aiService');
const { isAuthenticated, isPremiumUser, checkGoalLimit } = require('../middleware/auth');

// Middleware to check if feature is available on free plan
const checkFeatureAccess = (featureName) => {
    return (req, res, next) => {
        // List of premium-only features
        const premiumFeatures = ['ai-report', 'social-post', 'export-pdf'];
        
        // If this is a premium feature and user is on free plan
        if (premiumFeatures.includes(featureName) && req.session.user.subscription_plan === 'free') {
            return res.status(403).render('subscription', { 
                title: 'Premium Feature - Goal Tracker',
                error: 'This feature is only available to premium subscribers.',
                from: 'feature'
            });
        }
        
        next();
    };
};

// Apply authentication middleware to all routes
router.use(isAuthenticated);

// AI Dashboard route - redirect to main dashboard
router.get('/ai-dashboard', (req, res) => {
  res.redirect('/goals/dashboard');
});

// Get the leaderboard page
router.get('/leaderboard', (req, res) => {
    // Fetch top users based on completed goals and milestones
    db.all(`
        SELECT 
            u.id, 
            u.username, 
            COUNT(DISTINCT g.id) as total_goals,
            SUM(CASE WHEN g.status = 'completed' THEN 1 ELSE 0 END) as completed_goals,
            COUNT(DISTINCT m.id) as total_milestones,
            SUM(CASE WHEN m.status = 'completed' THEN 1 ELSE 0 END) as completed_milestones
        FROM 
            users u
        LEFT JOIN 
            goals g ON u.id = g.user_id
        LEFT JOIN 
            milestones m ON g.id = m.goal_id
        GROUP BY 
            u.id
        ORDER BY 
            completed_goals DESC, 
            completed_milestones DESC
        LIMIT 10
    `, [], (err, leaderboard) => {
        if (err) {
            console.error('Error fetching leaderboard data:', err);
            return res.status(500).render('error', { 
                title: 'Error - Goal Tracker',
                error: 'Failed to fetch leaderboard data'
            });
        }
        
        // Calculate completion percentages
        const leaderboardWithStats = leaderboard.map(user => {
            const goalCompletionRate = user.total_goals > 0 
                ? Math.round((user.completed_goals / user.total_goals) * 100) 
                : 0;
                
            const milestoneCompletionRate = user.total_milestones > 0 
                ? Math.round((user.completed_milestones / user.total_milestones) * 100) 
                : 0;
                
            const totalScore = (goalCompletionRate * 2) + milestoneCompletionRate;
            
            return {
                ...user,
                goalCompletionRate,
                milestoneCompletionRate,
                totalScore
            };
        });
        
        // Sort by total score
        leaderboardWithStats.sort((a, b) => b.totalScore - a.totalScore);
        
        res.render('goals/leaderboard', { 
            title: 'Leaderboard - Goal Tracker',
            leaderboard: leaderboardWithStats,
            currentUser: req.session.user
        });
    });
});

// Get the dashboard page with all goals for the current user
router.get('/dashboard', (req, res) => {
    // Get filter and sort parameters from query string
    const filter = req.query.filter || 'active';
    const sort = req.query.sort || 'newest';
    
    // Construct the SQL query based on filter and sort
    let sql = 'SELECT * FROM goals WHERE user_id = ?';
    const params = [req.session.user.id];
    
    if (filter === 'active') {
        sql += ' AND status = "active"';
    } else if (filter === 'completed') {
        sql += ' AND status = "completed"';
    } else if (filter === 'archived') {
        sql += ' AND status = "archived"';
    }
    
    // Apply sorting
    if (sort === 'newest') {
        sql += ' ORDER BY created_at DESC';
    } else if (sort === 'oldest') {
        sql += ' ORDER BY created_at ASC';
    } else if (sort === 'deadline') {
        sql += ' ORDER BY target_date ASC';
    }
    
    // Get all goals for the user
    db.all(sql, params, (err, goals) => {
        if (err) {
            console.error('Error fetching goals:', err);
            return res.status(500).render('error', { 
                title: 'Error - Goal Tracker',
                error: 'Error fetching goals. Please try again.'
            });
        }
        
        res.render('goals/dashboard', { 
            title: 'Dashboard - Goal Tracker',
            goals: goals,
            filter: filter,
            sort: sort
        });
    });
});

// Get goal detail page
router.get('/detail/:id', (req, res) => {
    const goalId = req.query.id || req.params.id;
    const userId = req.session.user.id;
    
    // First, fetch the goal data
    db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, goal) => {
        if (err) {
            console.error('Error fetching goal:', err);
            return res.status(500).render('error', { 
                title: 'Error - Goal Tracker',
                error: 'Error fetching goal details. Please try again.'
            });
        }
        
        if (!goal) {
            return res.status(404).render('error', { 
                title: 'Not Found - Goal Tracker',
                error: 'Goal not found or you do not have permission to view it.'
            });
        }
        
        // Calculate days remaining
        const targetDate = new Date(goal.target_date);
        const now = new Date();
        const daysRemaining = Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24));
        
        // Get the milestones for this goal
        db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY display_order ASC, target_date ASC', [goalId], (err, milestones) => {
            if (err) {
                console.error('Error fetching milestones:', err);
                milestones = [];
            }
            
            // Calculate progress percentage
            const totalMilestones = milestones.length;
            const completedMilestones = milestones.filter(m => m.status === 'completed').length;
            const progressPercent = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
            
            // Get logs (check-ins) for this goal
            db.all('SELECT * FROM goal_logs WHERE goal_id = ? ORDER BY created_at DESC', [goalId], (err, logs) => {
                if (err) {
                    console.error('Error fetching logs:', err);
                    logs = [];
                }
                
                // Get notes for this goal
                db.all('SELECT * FROM goal_notes WHERE goal_id = ? ORDER BY created_at DESC', [goalId], (err, notes) => {
                    if (err) {
                        console.error('Error fetching notes:', err);
                        notes = [];
                    }
                    
                    // Calculate completed milestones and total milestones
                    const completedCount = milestones.filter(m => m.status === 'completed').length;
                    const totalMilestones = milestones.length;
                    const checkInCount = logs ? logs.length : 0;
                    let streakPoints = completedCount * 10;
                    if (logs) streakPoints += logs.length * 5;
                    
                    res.render('goals/detail', { 
                        title: `${goal.title} - Goal Tracker`,
                        goal: goal,
                        milestones: milestones,
                        logs: logs,
                        notes: notes,
                        daysRemaining: daysRemaining,
                        progressPercent: progressPercent,
                        completedCount: completedCount,
                        totalMilestones: totalMilestones,
                        checkInCount: checkInCount,
                        streakPoints: streakPoints
                    });
                });
            });
        });
    });
});

// Export progress as PDF or CSV page
router.get('/export/:id', (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    
    // Fetch goal data
    db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, goal) => {
        if (err || !goal) {
            return res.status(404).render('error', { 
                title: 'Error - Goal Tracker',
                error: 'Goal not found'
            });
        }
        
        res.render('goals/export', { 
            title: `Export ${goal.title} - Goal Tracker`,
            goal: goal
        });
    });
});

// Get all goals for the current user API endpoint
router.get('/', (req, res) => {
    const userId = req.session.user.id;
    const filter = req.query.filter || 'all';
    const sort = req.query.sort || 'newest';
    
    let query = 'SELECT * FROM goals WHERE user_id = ?';
    const params = [userId];
    
    // Apply filters
    if (filter === 'active') {
        query += ' AND status = "active"';
    } else if (filter === 'completed') {
        query += ' AND status = "completed"';
    } else if (filter === 'archived') {
        query += ' AND status = "archived"';
    }
    
    // Apply sorting
    if (sort === 'newest') {
        query += ' ORDER BY created_at DESC';
    } else if (sort === 'oldest') {
        query += ' ORDER BY created_at ASC';
    } else if (sort === 'deadline') {
        query += ' ORDER BY target_date ASC';
    } else if (sort === 'progress') {
        // Will need to sort in JavaScript after fetching data
        query += ' ORDER BY id ASC';
    }
    
    db.all(query, params, (err, goals) => {
        if (err) {
            console.error('Error fetching goals:', err);
            return res.status(500).json({ error: 'Failed to fetch goals' });
        }
        
        res.status(200).json(goals);
    });
});

// Get a specific goal with its milestones API endpoint
router.get('/:id', (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    
    // First, get the goal
    db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, goal) => {
        if (err) {
            console.error('Error fetching goal:', err);
            return res.status(500).json({ error: 'Failed to fetch goal' });
        }
        
        if (!goal) {
            return res.status(404).json({ error: 'Goal not found' });
        }
        
        // Then, get the milestones for this goal
        db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY target_date ASC', [goalId], (err, milestones) => {
            if (err) {
                console.error('Error fetching milestones:', err);
                return res.status(500).json({ error: 'Failed to fetch milestones' });
            }
            
            // Parse the metrics field from JSON string
            const milestonesWithParsedMetrics = milestones.map(milestone => {
                try {
                    return {
                        ...milestone,
                        metrics: milestone.metrics ? JSON.parse(milestone.metrics) : []
                    };
                } catch (e) {
                    return {
                        ...milestone,
                        metrics: []
                    };
                }
            });
            
            // Return goal with milestones
            res.status(200).json({
                ...goal,
                milestones: milestonesWithParsedMetrics
            });
        });
    });
});

// Create a new goal (duplicate route for AI assistant compatibility)
router.post('/create', async (req, res) => {
    const { title, description, category, startDate, targetDate, target_date } = req.body;
        const userId = req.session.user.id;
    
    // Handle both startDate/targetDate and target_date formats
    const finalTargetDate = targetDate || target_date;
    const finalStartDate = startDate || new Date().toISOString().split('T')[0];
    const finalCategory = category || 'general';
    
    if (!title || !finalTargetDate) {
            return res.status(400).json({ error: 'Title and target date are required' });
        }
        
    try {
        // Create the goal
        const goalId = await new Promise((resolve, reject) => {
            db.run('INSERT INTO goals (user_id, title, description, category, start_date, target_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [userId, title, description || '', finalCategory, finalStartDate, finalTargetDate, 'active'],
                function(err) {
                if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                }
                }
            );
        });
                
        // Generate milestones for the goal (same logic as main route)
        const startDateObj = new Date(finalStartDate);
        const targetDateObj = new Date(finalTargetDate);
        const totalDays = Math.ceil((targetDateObj - startDateObj) / (1000 * 60 * 60 * 24));
                
        let milestones = [];
        const subscriptionPlan = req.session.user.subscription_plan || 'free';
                    
        // For paid users, generate AI milestones; for free users, use default milestones
                    if (subscriptionPlan === 'monthly' || subscriptionPlan === 'annual') {
            try {
                console.log(`🤖 Generating AI milestones for paid user ${userId} (AI Assistant)...`);
                
                // Generate AI milestones
                const aiMilestones = await aiService.generateMilestones(
                    title,
                    description || '',
                    finalStartDate,
                    finalTargetDate,
                    finalCategory,
                    subscriptionPlan
                );
                
                if (aiMilestones && Array.isArray(aiMilestones) && aiMilestones.length > 0) {
                    milestones = aiMilestones;
                    console.log(`✅ Generated ${milestones.length} AI milestones for: ${title}`);
                } else {
                    console.log('⚠️ AI milestone generation failed, falling back to defaults');
                    milestones = getDefaultMilestones(title, startDateObj, targetDateObj, totalDays);
                }
            } catch (error) {
                console.error('❌ Error generating AI milestones:', error);
                milestones = getDefaultMilestones(title, startDateObj, targetDateObj, totalDays);
            }
        } else {
            // Free users get default milestones
            console.log(`📝 Using default milestones for free user ${userId} (AI Assistant)`);
            milestones = getDefaultMilestones(title, startDateObj, targetDateObj, totalDays);
        }
        
        // Create milestones in database
        for (let i = 0; i < milestones.length; i++) {
            const milestone = milestones[i];
            
            // Handle different milestone formats from AI vs default
            const milestoneTitle = milestone.title;
            const milestoneDescription = milestone.description;
            const milestoneTargetDate = milestone.targetDate || milestone.target_date;
            const milestoneMetrics = milestone.metrics || [];
            
            await new Promise((resolve, reject) => {
                const metricsJson = JSON.stringify(milestoneMetrics);
                
                db.run('INSERT INTO milestones (goal_id, title, description, target_date, status, metrics, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [goalId, milestoneTitle, milestoneDescription, milestoneTargetDate, 'pending', metricsJson, i + 1],
                                function(err) {
                                    if (err) {
                                        reject(err);
                                    } else {
                                        resolve(this.lastID);
                                    }
                                }
                            );
                        });
        }
        
        // Track goal creation achievements
        try {
            const AchievementTracker = require('../utils/achievements');
            const StreakTracker = require('../utils/streak-tracker');
            
            // Record daily activity for goal creation
            await StreakTracker.recordDailyActivity(userId, 'goal_creation');
            
            // Track basic goal creation achievements
            const creationAchievements = await AchievementTracker.trackGoalCreated(userId);
            
            // Track active goals count achievements
            const activeGoalsAchievements = await AchievementTracker.trackActiveGoalsCount(userId);
            
            const allUnlockedAchievements = [...(creationAchievements || []), ...(activeGoalsAchievements || [])];
            
            if (allUnlockedAchievements.length > 0) {
                console.log(`🏆 User ${userId} unlocked ${allUnlockedAchievements.length} achievements for creating a goal`);
            }
        } catch (achievementError) {
            console.error('Error tracking goal creation achievements:', achievementError);
            // Don't fail the goal creation if achievement tracking fails
        }
        
        res.json({ 
            success: true, 
            goalId: goalId,
            message: 'Goal created successfully'
        });
        
    } catch (error) {
        console.error('Error creating goal:', error);
        res.status(500).json({ success: false, error: 'Failed to create goal' });
    }
});

// List goals (for AI assistant)
router.get('/list', (req, res) => {
    const userId = req.session.user.id;
    
    db.all('SELECT id, title, description, category, status, target_date FROM goals WHERE user_id = ? ORDER BY created_at DESC', 
        [userId], (err, goals) => {
        if (err) {
            console.error('Error fetching goals list:', err);
            return res.status(500).json({ success: false, error: 'Failed to fetch goals' });
        }
        
        res.json({ 
            success: true, 
            goals: goals || []
        });
    });
});

// Create a new goal (main route)
router.post('/', async (req, res) => {
    const { title, description, category, startDate, targetDate } = req.body;
    const userId = req.session.user.id;
    
    if (!title || !targetDate || !category || !startDate) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
        // Create the goal
        const goalId = await new Promise((resolve, reject) => {
            db.run('INSERT INTO goals (user_id, title, description, category, start_date, target_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [userId, title, description, category, startDate, targetDate, 'active'],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });
        
        // Auto-generate 6 milestones for the goal
        const startDateObj = new Date(startDate);
        const targetDateObj = new Date(targetDate);
        const totalDays = Math.ceil((targetDateObj - startDateObj) / (1000 * 60 * 60 * 24));
        
        // Create milestones
        let milestones = [];
        const subscriptionPlan = req.session.user.subscription_plan || 'free';
        
        // For paid users, generate AI milestones; for free users, use default milestones
        if (subscriptionPlan === 'monthly' || subscriptionPlan === 'annual') {
            try {
                console.log(`🤖 Generating AI milestones for paid user ${userId}...`);
                
                // Generate AI milestones
                const aiMilestones = await aiService.generateMilestones(
                    title,
                    description,
                    startDate,
                    targetDate,
                    category,
                    subscriptionPlan
                );
                
                if (aiMilestones && Array.isArray(aiMilestones) && aiMilestones.length > 0) {
                    milestones = aiMilestones;
                    console.log(`✅ Generated ${milestones.length} AI milestones for: ${title}`);
                } else {
                    console.log('⚠️ AI milestone generation failed, falling back to defaults');
                    milestones = getDefaultMilestones(title, startDateObj, targetDateObj, totalDays);
                }
            } catch (error) {
                console.error('❌ Error generating AI milestones:', error);
                milestones = getDefaultMilestones(title, startDateObj, targetDateObj, totalDays);
            }
        } else {
            // Free users get default milestones
            console.log(`📝 Using default milestones for free user ${userId}`);
            milestones = getDefaultMilestones(title, startDateObj, targetDateObj, totalDays);
        }
        
        // Create milestones in database
        for (let i = 0; i < milestones.length; i++) {
            const milestone = milestones[i];
            
            // Handle different milestone formats from AI vs default
            const milestoneTitle = milestone.title;
            const milestoneDescription = milestone.description;
            const milestoneTargetDate = milestone.targetDate || milestone.target_date;
            const milestoneMetrics = milestone.metrics || [];
            
            await new Promise((resolve, reject) => {
                const metricsJson = JSON.stringify(milestoneMetrics);
                
                db.run('INSERT INTO milestones (goal_id, title, description, target_date, status, metrics, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [goalId, milestoneTitle, milestoneDescription, milestoneTargetDate, 'pending', metricsJson, i + 1],
                    function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(this.lastID);
                        }
                    }
                );
            });
        }
        
        // Track goal creation achievements
        try {
            const AchievementTracker = require('../utils/achievements');
            const StreakTracker = require('../utils/streak-tracker');
            
            // Record daily activity for goal creation
            await StreakTracker.recordDailyActivity(userId, 'goal_creation');
            
            // Track basic goal creation achievements
            const creationAchievements = await AchievementTracker.trackGoalCreated(userId);
            
            // Track active goals count achievements
            const activeGoalsAchievements = await AchievementTracker.trackActiveGoalsCount(userId);
            
            const allUnlockedAchievements = [...(creationAchievements || []), ...(activeGoalsAchievements || [])];
            
            if (allUnlockedAchievements.length > 0) {
                console.log(`🏆 User ${userId} unlocked ${allUnlockedAchievements.length} achievements for creating a goal`);
            }
        } catch (achievementError) {
            console.error('Error tracking goal creation achievements:', achievementError);
            // Don't fail the goal creation if achievement tracking fails
        }
        
        res.json({ 
            success: true, 
            goalId: goalId,
            redirectUrl: `/goals/detail/${goalId}`
        });
        
    } catch (error) {
        console.error('Error creating goal:', error);
        res.status(500).json({ error: 'Failed to create goal' });
    }
});

// Add a check-in/log for a goal
router.post('/:id/logs', (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    const { content, mood } = req.body;
    
    if (!content) {
        return res.status(400).json({ error: 'Log content is required' });
    }
    
    // Verify goal ownership
    db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, goal) => {
        if (err || !goal) {
            return res.status(404).json({ error: 'Goal not found or access denied' });
        }
        
        // Add log
        db.run(
            'INSERT INTO goal_logs (goal_id, content, mood, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
            [goalId, content, mood || 'neutral'],
            async function(err) {
                if (err) {
                    console.error('Error creating log:', err);
                    return res.status(500).json({ error: 'Failed to create log' });
                }
                
                // Track check-in achievements
                try {
                    const AchievementTracker = require('../utils/achievements');
                    const unlockedAchievements = await AchievementTracker.trackCheckInLogged(userId, mood);
                    
                    if (unlockedAchievements.length > 0) {
                        console.log(`🏆 User ${userId} unlocked ${unlockedAchievements.length} achievements for logging a check-in`);
                    }
                } catch (achievementError) {
                    console.error('Error tracking check-in achievements:', achievementError);
                    // Don't fail the log creation if achievement tracking fails
                }
                
                // Return success
                res.status(201).json({
                    id: this.lastID,
                    goal_id: goalId,
                    content,
                    mood: mood || 'neutral',
                    created_at: new Date().toISOString()
                });
            }
        );
    });
});

// Add a note for a goal
router.post('/:id/notes', (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    const { title, content } = req.body;
    
    if (!content) {
        return res.status(400).json({ error: 'Note content is required' });
    }
    
    // Verify goal ownership
    db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, goal) => {
        if (err || !goal) {
            return res.status(404).json({ error: 'Goal not found or access denied' });
        }
        
        // Add note
        db.run(
            'INSERT INTO goal_notes (goal_id, title, content, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
            [goalId, title || 'Untitled Note', content],
            async function(err) {
                if (err) {
                    console.error('Error creating note:', err);
                    return res.status(500).json({ error: 'Failed to create note' });
                }
                
                // Track note achievements with note length
                try {
                    const AchievementTracker = require('../utils/achievements');
                    const unlockedAchievements = await AchievementTracker.trackNoteWithLength(userId, content.length);
                    
                    if (unlockedAchievements.length > 0) {
                        console.log(`🏆 User ${userId} unlocked ${unlockedAchievements.length} achievements for adding a note`);
                    }
                } catch (achievementError) {
                    console.error('Error tracking note achievements:', achievementError);
                    // Don't fail the note creation if achievement tracking fails
                }
                
                // Return success
                res.status(201).json({
                    id: this.lastID,
                    goal_id: goalId,
                    title: title || 'Untitled Note',
                    content: content,
                    created_at: new Date().toISOString()
                });
            }
        );
    });
});

// Update a goal
router.put('/:id', async (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    const { title, description, category, startDate, targetDate, status } = req.body;
    
    // Validate dates if both are provided
    if (startDate && targetDate && new Date(startDate) >= new Date(targetDate)) {
        return res.status(400).json({ error: 'Start date must be before target date' });
    }
    
    // Get the current goal status for comparison
    const currentGoal = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
    
    if (!currentGoal) {
        return res.status(404).json({ error: 'Goal not found or you do not have permission to edit it' });
    }
    
    // Update the goal
    db.run(
        'UPDATE goals SET title = ?, description = ?, category = ?, start_date = ?, target_date = ?, status = ? WHERE id = ? AND user_id = ?',
        [title, description, category, startDate, targetDate, status, goalId, userId],
        async function(err) {
            if (err) {
                console.error('Error updating goal:', err);
                return res.status(500).json({ error: 'Failed to update goal' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Goal not found or you do not have permission to edit it' });
            }
            
            // Track achievements if goal was completed
            if (status === 'completed' && currentGoal.status !== 'completed') {
                try {
                    const AchievementTracker = require('../utils/achievements');
                    const goalData = {
                        id: goalId,
                        title,
                        category: category || currentGoal.category,
                        status,
                        user_id: userId,
                        target_date: targetDate || currentGoal.target_date,
                        created_at: currentGoal.created_at
                    };
                    
                    // Use enhanced tracking for timing-based achievements
                    const unlockedAchievements = await AchievementTracker.trackGoalCompletedWithTiming(userId, goalData);
                    
                    if (unlockedAchievements.length > 0) {
                        console.log(`🏆 User ${userId} unlocked ${unlockedAchievements.length} achievements for completing a goal`);
                    }
                } catch (achievementError) {
                    console.error('Error tracking goal completion achievement:', achievementError);
                    // Don't fail the goal update if achievement tracking fails
                }
            }
            
            // Return the updated goal
            res.status(200).json({
                id: goalId,
                user_id: userId,
                title,
                description,
                category,
                start_date: startDate,
                target_date: targetDate,
                status
            });
        }
    );
});

// Delete a goal
router.delete('/:id', (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    
    // Delete the goal's milestones, logs and notes first
    db.serialize(() => {
        db.run('DELETE FROM milestones WHERE goal_id = ?', [goalId]);
        db.run('DELETE FROM goal_logs WHERE goal_id = ?', [goalId]);
        db.run('DELETE FROM goal_notes WHERE goal_id = ?', [goalId]);
        
        // Then delete the goal
        db.run('DELETE FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], function(err) {
            if (err) {
                console.error('Error deleting goal:', err);
                return res.status(500).json({ error: 'Failed to delete goal' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Goal not found or you do not have permission to delete it' });
            }
            
            res.status(200).json({ message: 'Goal deleted successfully' });
        });
    });
});

// CSV Export route
router.get('/:id/export/csv', (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    
    // Check goal ownership
    db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, goal) => {
        if (err || !goal) {
            return res.status(404).json({ error: 'Goal not found or access denied' });
        }
        
        // Get all data related to this goal
        db.serialize(() => {
            // Get milestones
            db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY target_date ASC', [goalId], (err, milestones) => {
                if (err) {
                    console.error('Error fetching milestones for export:', err);
                    return res.status(500).json({ error: 'Failed to fetch milestone data' });
                }
                
                // Get logs
                db.all('SELECT * FROM goal_logs WHERE goal_id = ? ORDER BY created_at DESC', [goalId], (err, logs) => {
                    if (err) {
                        console.error('Error fetching logs for export:', err);
                        return res.status(500).json({ error: 'Failed to fetch log data' });
                    }
                    
                    // Get notes
                    db.all('SELECT * FROM goal_notes WHERE goal_id = ? ORDER BY created_at DESC', [goalId], (err, notes) => {
                        if (err) {
                            console.error('Error fetching notes for export:', err);
                            return res.status(500).json({ error: 'Failed to fetch note data' });
                        }
                        
                        // Parse milestone metrics
                        const milestonesWithParsedMetrics = milestones.map(milestone => {
                            try {
                                return {
                                    ...milestone,
                                    metrics: milestone.metrics ? JSON.parse(milestone.metrics) : []
                                };
                            } catch (e) {
                                return {
                                    ...milestone,
                                    metrics: []
                                };
                            }
                        });
                        
                        // Generate CSV content
                        // Goal info first
                        let csvContent = 'Goal Information\n';
                        csvContent += 'ID,Title,Description,Category,Status,Start Date,Target Date,Created At\n';
                        csvContent += `${goal.id},"${goal.title.replace(/"/g, '""')}","${(goal.description || '').replace(/"/g, '""')}",${goal.category || ''},${goal.status},${new Date(goal.start_date).toLocaleDateString()},${new Date(goal.target_date).toLocaleDateString()},${new Date(goal.created_at).toLocaleDateString()}\n\n`;
                        
                        // Milestones
                        csvContent += 'Milestones\n';
                        csvContent += 'ID,Title,Description,Status,Target Date\n';
                        milestonesWithParsedMetrics.forEach(milestone => {
                            csvContent += `${milestone.id},"${milestone.title.replace(/"/g, '""')}","${(milestone.description || '').replace(/"/g, '""')}",${milestone.status},${new Date(milestone.target_date).toLocaleDateString()}\n`;
                        });
                        csvContent += '\n';
                        
                        // Logs
                        csvContent += 'Check-ins/Logs\n';
                        csvContent += 'ID,Content,Mood,Created At\n';
                        logs.forEach(log => {
                            csvContent += `${log.id},"${log.content.replace(/"/g, '""')}",${log.mood},${new Date(log.created_at).toLocaleDateString()}\n`;
                        });
                        csvContent += '\n';
                        
                        // Notes
                        csvContent += 'Notes\n';
                        csvContent += 'ID,Title,Content,Created At\n';
                        notes.forEach(note => {
                            csvContent += `${note.id},"${(note.title || 'Untitled').replace(/"/g, '""')}","${note.content.replace(/"/g, '""')}",${new Date(note.created_at).toLocaleDateString()}\n`;
                        });
                        
                        // Set headers for CSV download
                        res.setHeader('Content-Type', 'text/csv');
                        res.setHeader('Content-Disposition', `attachment; filename=${goal.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.csv`);
                        
                        // Send CSV data
                        res.send(csvContent);
                    });
                });
            });
        });
    });
});

// PDF Export route
router.get('/:id/export/pdf', checkFeatureAccess('export-pdf'), (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    
    // Since generating PDF requires additional packages like PDFKit which might not be installed
    // We'll return a message to install the required package
    res.status(501).json({ 
        message: 'PDF export functionality is coming soon. Please use CSV export in the meantime.' 
    });
    
    // TODO: Implement PDF generation when the appropriate packages are installed
});

// AI Enhanced PDF Export route
router.get('/:id/export/ai-report', checkFeatureAccess('ai-report'), (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    
    // Check goal ownership
    db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, goal) => {
        if (err || !goal) {
            return res.status(404).json({ error: 'Goal not found or access denied' });
        }
        
        // Get all data related to this goal
        db.serialize(() => {
            // Get milestones
            db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY target_date ASC', [goalId], (err, milestones) => {
                if (err) {
                    console.error('Error fetching milestones for export:', err);
                    return res.status(500).json({ error: 'Failed to fetch milestone data' });
                }
                
                // Get logs
                db.all('SELECT * FROM goal_logs WHERE goal_id = ? ORDER BY created_at DESC', [goalId], (err, logs) => {
                    if (err) {
                        console.error('Error fetching logs for export:', err);
                        return res.status(500).json({ error: 'Failed to fetch log data' });
                    }
                    
                    // Get notes
                    db.all('SELECT * FROM goal_notes WHERE goal_id = ? ORDER BY created_at DESC', [goalId], (err, notes) => {
                        if (err) {
                            console.error('Error fetching notes for export:', err);
                            return res.status(500).json({ error: 'Failed to fetch note data' });
                        }
                        
                        // In a real implementation, we would:
                        // 1. Parse and process the data
                        // 2. Send it to an AI service for analysis
                        // 3. Generate a PDF with the AI insights
                        
                        // For now, we'll simulate the AI analysis
                        const aiAnalysis = {
                            progressAnalysis: "Based on your milestone completion rate and check-in frequency, you're making steady progress toward your goal. Your consistent efforts are paying off, with noticeable improvement in the past month.",
                            recommendations: [
                                "Continue your current pace to meet your deadline",
                                "Consider breaking down your next milestone into smaller, more manageable tasks",
                                "Your check-ins show you're most productive in the morning - try to schedule goal work during this time",
                                "Based on your notes, you may want to revisit your approach to the research phase"
                            ],
                            successProbability: 85
                        };
                        
                        // In a real app, you would generate a PDF here
                        // For now, we'll just return the data
                        res.status(200).json({
                            goal,
                            milestones,
                            logs,
                            notes,
                            aiAnalysis,
                            message: 'In a real implementation, this would generate and return a PDF file'
                        });
                    });
                });
            });
        });
    });
});

// Update a milestone
router.put('/milestone/:id', async (req, res) => {
    const milestoneId = req.params.id;
    const userId = req.session.user.id;
    const { title, description, targetDate, status, metrics, progress_percentage } = req.body;
    
    // First verify that the milestone belongs to the user
    const milestone = await new Promise((resolve, reject) => {
    db.get(
        `SELECT m.* FROM milestones m 
         JOIN goals g ON m.goal_id = g.id 
         WHERE m.id = ? AND g.user_id = ?`,
        [milestoneId, userId],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
            
            if (!milestone) {
                return res.status(404).json({ error: 'Milestone not found or you do not have permission to edit it' });
            }
            
            // Convert metrics to JSON string
            const metricsJson = JSON.stringify(metrics || []);
            
            // Determine which fields to update based on what was provided
            let updateFields = [];
            let updateValues = [];
            
            if (title !== undefined) {
                updateFields.push('title = ?');
                updateValues.push(title);
            }
            if (description !== undefined) {
                updateFields.push('description = ?');
                updateValues.push(description);
            }
            if (targetDate !== undefined) {
                updateFields.push('target_date = ?');
                updateValues.push(targetDate);
            }
            if (status !== undefined) {
                updateFields.push('status = ?');
                updateValues.push(status);
            }
            if (metrics !== undefined) {
                updateFields.push('metrics = ?');
                updateValues.push(metricsJson);
            }
            if (progress_percentage !== undefined) {
                updateFields.push('progress_percentage = ?');
                updateValues.push(parseInt(progress_percentage));
            }
            
            // Add completed_at timestamp if being completed
            if (status === 'completed' && milestone.status !== 'completed') {
                updateFields.push('completed_at = CURRENT_TIMESTAMP');
            }
            
            // Add milestone ID to the end of values array
            updateValues.push(milestoneId);
            
            const updateQuery = `UPDATE milestones SET ${updateFields.join(', ')} WHERE id = ?`;
            
            db.run(updateQuery, updateValues, async function(err) {
                    if (err) {
                        console.error('Error updating milestone:', err);
                        return res.status(500).json({ error: 'Failed to update milestone' });
                    }
            
            // Track achievements if milestone was completed
            if (status === 'completed' && milestone.status !== 'completed') {
                try {
                    const AchievementTracker = require('../utils/achievements');
                    const milestoneData = {
                        id: milestoneId,
                        title: title || milestone.title,
                        target_date: targetDate || milestone.target_date,
                        created_at: milestone.created_at
                    };
                    
                    // Use enhanced tracking for timing-based achievements
                    const unlockedAchievements = await AchievementTracker.trackMilestoneCompletedWithTiming(userId, milestoneData);
                    
                    if (unlockedAchievements.length > 0) {
                        console.log(`🏆 User ${userId} unlocked ${unlockedAchievements.length} achievements for completing a milestone`);
                    }
                } catch (achievementError) {
                    console.error('Error tracking milestone completion achievement:', achievementError);
                    // Don't fail the milestone update if achievement tracking fails
                }
            }
                    
                    // Return the updated milestone
                    res.status(200).json({
                        id: milestoneId,
                        goal_id: milestone.goal_id,
                        title: title || milestone.title,
                        description: description || milestone.description,
                        target_date: targetDate || milestone.target_date,
                        status: status || milestone.status,
                        progress_percentage: progress_percentage !== undefined ? parseInt(progress_percentage) : milestone.progress_percentage,
                        metrics: metrics || []
                    });
        }
    );
});

// Create a custom milestone using AI
router.post('/:id/custom-milestone', async (req, res) => {
    try {
        const goalId = req.params.id;
        const userId = req.session.user.id;
        const { description, targetDate } = req.body;
        const subscriptionPlan = req.session.user.subscription_plan || 'free';
        
        if (!description || !targetDate) {
            return res.status(400).json({ error: 'Description and target date are required' });
        }
        
        // Verify goal ownership
        db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], async (err, goal) => {
            if (err || !goal) {
                return res.status(404).json({ error: 'Goal not found or access denied' });
            }
            
            try {
                let milestone;
                
                // Only use AI for premium users
                if (subscriptionPlan === 'monthly' || subscriptionPlan === 'annual') {
                    // Use the existing generateMilestones function to create one milestone
                    // We'll pass the description as the title to get a single milestone about that specific task
                    const milestones = await aiService.generateMilestones(
                        description, // Use the custom milestone description as the title for focused generation
                        `This is a single milestone for the goal: ${goal.title}`, // Context
                        targetDate, // Target date
                        goal.category || 'personal', // Use the goal's category
                        subscriptionPlan // User's subscription plan
                    );
                    
                    // Take the first milestone from the generated list (or create a default if none)
                    if (Array.isArray(milestones) && milestones.length > 0) {
                        milestone = milestones[0];
                    } else {
                        // Default milestone if generation fails
                        milestone = {
                            title: description.length > 50 ? description.substring(0, 47) + '...' : description,
                            description: "Complete this milestone as part of your goal.",
                            targetDate: targetDate,
                            metrics: [{ name: "Completion", target: 100, unit: "percent" }]
                        };
                    }
                } else {
                    // For free users, just create a basic milestone
                    milestone = {
                        title: description.length > 50 ? description.substring(0, 47) + '...' : description,
                        description: "Complete this milestone as part of your goal.",
                        targetDate: targetDate,
                        metrics: [{ name: "Completion", target: 100, unit: "%" }]
                    };
                }
                
                // Ensure the milestone has a targetDate property (may be returned as target_date)
                if (!milestone.targetDate && milestone.target_date) {
                    milestone.targetDate = milestone.target_date;
                }
                
                // Add the milestone to the database
                const metricsJson = JSON.stringify(milestone.metrics || []);
                
                // Get the next display order for this goal
                db.get('SELECT MAX(display_order) as max_order FROM milestones WHERE goal_id = ?', [goalId], (orderErr, orderResult) => {
                    if (orderErr) {
                        console.error('Error getting milestone order:', orderErr);
                        return res.status(500).json({ error: 'Failed to determine milestone order' });
                    }
                    
                    const nextOrder = (orderResult.max_order || 0) + 1;
                
                db.run(
                        'INSERT INTO milestones (goal_id, title, description, target_date, metrics, status, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [goalId, milestone.title, milestone.description, targetDate, metricsJson, 'pending', nextOrder],
                    function(err) {
                        if (err) {
                            console.error('Error creating custom milestone:', err);
                            return res.status(500).json({ error: 'Failed to create milestone' });
                        }
                        
                        // Return the created milestone
                        res.status(201).json({
                            id: this.lastID,
                            goal_id: parseInt(goalId),
                            title: milestone.title,
                            description: milestone.description,
                            target_date: targetDate,
                            metrics: milestone.metrics || [],
                            status: 'pending'
                        });
                    }
                );
                });
            } catch (aiError) {
                console.error('Error generating custom milestone:', aiError);
                
                // Create a basic milestone if AI generation fails
                const basicMilestone = {
                    title: description,
                    description: "Complete this milestone as part of your goal.",
                    metrics: [{ name: "Completion", target: 100, unit: "%" }]
                };
                
                const metricsJson = JSON.stringify(basicMilestone.metrics);
                
                // Get the next display order for this goal
                db.get('SELECT MAX(display_order) as max_order FROM milestones WHERE goal_id = ?', [goalId], (orderErr, orderResult) => {
                    if (orderErr) {
                        console.error('Error getting milestone order:', orderErr);
                        return res.status(500).json({ error: 'Failed to determine milestone order' });
                    }
                    
                    const nextOrder = (orderResult.max_order || 0) + 1;
                
                db.run(
                        'INSERT INTO milestones (goal_id, title, description, target_date, metrics, status, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [goalId, basicMilestone.title, basicMilestone.description, targetDate, metricsJson, 'pending', nextOrder],
                    function(err) {
                        if (err) {
                            console.error('Error creating basic milestone:', err);
                            return res.status(500).json({ error: 'Failed to create milestone' });
                        }
                        
                        res.status(201).json({
                            id: this.lastID,
                            goal_id: parseInt(goalId),
                            title: basicMilestone.title,
                            description: basicMilestone.description,
                            target_date: targetDate,
                            metrics: basicMilestone.metrics,
                            status: 'pending'
                        });
                    }
                );
                });
            }
        });
    } catch (error) {
        console.error('Error in custom milestone creation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Reorder milestones
router.post('/:id/reorder-milestones', (req, res) => {
    try {
        const goalId = req.params.id;
        const userId = req.session.user.id;
        const { milestoneOrder } = req.body;
        
        if (!milestoneOrder || !Array.isArray(milestoneOrder)) {
            return res.status(400).json({ error: 'Invalid milestone order data' });
        }
        
        // Verify goal ownership
        db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], (err, goal) => {
            if (err || !goal) {
                return res.status(404).json({ error: 'Goal not found or access denied' });
            }
            
            // Update the order of each milestone
            const updatePromises = milestoneOrder.map(item => {
                return new Promise((resolve, reject) => {
                    // Add order column to milestones table if it doesn't exist
                    db.run(
                        'UPDATE milestones SET display_order = ? WHERE id = ? AND goal_id = ?',
                        [item.order, item.id, goalId],
                        function(err) {
                            if (err) {
                                reject(err);
                            } else {
                                resolve();
                            }
                        }
                    );
                });
            });
            
            Promise.all(updatePromises)
                .then(() => {
                    res.json({ success: true, message: 'Milestone order updated successfully' });
                })
                .catch(error => {
                    console.error('Error updating milestone order:', error);
                    res.status(500).json({ error: 'Failed to update milestone order' });
                });
        });
    } catch (error) {
        console.error('Error in milestone reordering:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Reconfigure milestones with AI
router.post('/:id/reconfigure-milestones', async (req, res) => {
    try {
        const goalId = req.params.id;
        const userId = req.session.user.id;
        const { prompt, startDate, endDate, replaceExisting } = req.body;
        const subscriptionPlan = req.session.user.subscription_plan || 'free';
        
        if (!prompt || !startDate || !endDate) {
            return res.status(400).json({ error: 'Prompt, start date, and end date are required' });
        }
        
        // Verify goal ownership
        db.get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [goalId, userId], async (err, goal) => {
            if (err || !goal) {
                return res.status(404).json({ error: 'Goal not found or access denied' });
            }
            
            try {
                let newMilestones;
                
                // Only use AI for premium users
                if (subscriptionPlan === 'monthly' || subscriptionPlan === 'annual') {
                    // Create a more detailed prompt for milestone generation
                    const detailedPrompt = `${goal.title}: ${prompt}. The user wants to approach this differently. Generate milestones from ${startDate} to ${endDate}.`;
                    
                    // Generate new milestones using AI service
                    newMilestones = await aiService.generateMilestones(
                        goal.title,
                        detailedPrompt,
                        endDate,
                        goal.category || 'personal',
                        subscriptionPlan
                    );
                } else {
                    // For free users, create basic milestones based on the prompt
                    const timeSpan = new Date(endDate).getTime() - new Date(startDate).getTime();
                    const numMilestones = Math.min(Math.max(Math.floor(timeSpan / (1000 * 60 * 60 * 24 * 7)), 3), 7); // Between 3-7 milestones
                    
                    newMilestones = [];
                    for (let i = 0; i < numMilestones; i++) {
                        const milestoneDate = new Date(new Date(startDate).getTime() + (timeSpan * (i + 1) / numMilestones));
                        newMilestones.push({
                            title: `Step ${i + 1} - ${goal.title}`,
                            description: `Work on ${goal.title} with focus on: ${prompt.substring(0, 100)}`,
                            targetDate: milestoneDate.toISOString().split('T')[0],
                            metrics: [{ name: "Progress", target: 100, unit: "%" }]
                        });
                    }
                }
                
                // If replacing existing milestones, delete them first
                if (replaceExisting) {
                    await new Promise((resolve, reject) => {
                        db.run('DELETE FROM milestones WHERE goal_id = ?', [goalId], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                }
                
                // Get the starting order number
                let startOrder = 1;
                if (!replaceExisting) {
                    const maxOrderResult = await new Promise((resolve, reject) => {
                        db.get('SELECT MAX(display_order) as max_order FROM milestones WHERE goal_id = ?', [goalId], (err, result) => {
                            if (err) reject(err);
                            else resolve(result);
                        });
                    });
                    startOrder = (maxOrderResult.max_order || 0) + 1;
                }
                
                // Insert new milestones
                const insertPromises = newMilestones.map((milestone, index) => {
                    return new Promise((resolve, reject) => {
                        const metricsJson = JSON.stringify(milestone.metrics || []);
                        
                        db.run(
                            'INSERT INTO milestones (goal_id, title, description, target_date, metrics, status, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            [goalId, milestone.title, milestone.description, milestone.targetDate, metricsJson, 'pending', startOrder + index],
                            function(err) {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(this.lastID);
                                }
                            }
                        );
                    });
                });
                
                await Promise.all(insertPromises);
                
                // Update goal dates if needed
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE goals SET start_date = ?, target_date = ? WHERE id = ?',
                        [startDate, endDate, goalId],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                
                res.json({ 
                    success: true, 
                    message: 'Milestones reconfigured successfully',
                    milestonesCount: newMilestones.length
                });
            } catch (error) {
                console.error('Error generating new milestones:', error);
                res.status(500).json({ error: 'Failed to generate new milestones. Please try again.' });
            }
        });
    } catch (error) {
        console.error('Error in milestone reconfiguration:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get the subscription page
router.get('/subscription', (req, res) => {
    res.render('subscription', {
        title: 'Subscription - Goal Tracker'
    });
});

// Process subscription
router.post('/subscribe', (req, res) => {
    const { plan } = req.body;
    const userId = req.session.user.id;
    
    // In a real application, this would integrate with a payment processor
    // and update the user's subscription status in the database
    
    // For now, we'll just simulate a successful subscription
    res.status(200).json({ success: true, message: 'Subscription successful!' });
});

// Get the social feed page
router.get('/social', (req, res) => {
    // In a real app, we would fetch posts from the database
    // For now, we'll just render the page
    res.render('goals/social', {
        title: 'Goal Community - Goal Tracker'
    });
});

// Create a social post
router.post('/social/post', (req, res) => {
    const { title, content, goalId, category, imageUrl } = req.body;
    const userId = req.session.user.id;
    
    // In a real app, this would save the post to the database
    // For now, we'll just simulate a successful post creation
    res.status(201).json({ success: true, message: 'Post created successfully!' });
});

// Like a post
router.post('/social/like/:postId', (req, res) => {
    const postId = req.params.postId;
    const userId = req.session.user.id;
    
    // In a real app, this would update the post's likes in the database
    // For now, we'll just simulate a successful like
    res.status(200).json({ success: true, message: 'Post liked!' });
});

// Comment on a post
router.post('/social/comment/:postId', (req, res) => {
    const postId = req.params.postId;
    const userId = req.session.user.id;
    const { content } = req.body;
    
    // In a real app, this would save the comment to the database
    // For now, we'll just simulate a successful comment
    res.status(201).json({ success: true, message: 'Comment added!' });
});

// Helper function to generate default milestones for free users
function getDefaultMilestones(title, startDateObj, targetDateObj, totalDays) {
    const defaultMilestones = [
        { title: 'Research and Planning', description: `Research and create a detailed plan for: ${title}`, percentage: 10 },
        { title: 'Initial Steps', description: `Take the first concrete steps towards: ${title}`, percentage: 25 },
        { title: 'Quarter Progress', description: `Reach 25% completion of: ${title}`, percentage: 40 },
        { title: 'Halfway Point', description: `Achieve 50% completion of: ${title}`, percentage: 60 },
        { title: 'Final Push', description: `Complete 75% and prepare for final sprint: ${title}`, percentage: 80 },
        { title: 'Goal Achievement', description: `Complete and celebrate: ${title}`, percentage: 100 }
    ];
    
    return defaultMilestones.map(milestone => {
        const milestoneDate = new Date(startDateObj.getTime() + (totalDays * (milestone.percentage / 100) * 24 * 60 * 60 * 1000));
        return {
            title: milestone.title,
            description: milestone.description,
            targetDate: milestoneDate.toISOString().split('T')[0],
            metrics: [{ name: "Progress", target: milestone.percentage, unit: "percent" }]
        };
    });
}

module.exports = router; 