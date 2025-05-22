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
        db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY target_date ASC', [goalId], (err, milestones) => {
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
                    
                    res.render('goals/detail', { 
                        title: `${goal.title} - Goal Tracker`,
                        goal: goal,
                        milestones: milestones,
                        logs: logs,
                        notes: notes,
                        daysRemaining: daysRemaining,
                        progressPercent: progressPercent
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

// Create a new goal with AI-generated milestones
router.post('/', checkGoalLimit, async (req, res) => {
    try {
        const { title, description, category, targetDate } = req.body;
        const userId = req.session.user.id;
        const subscriptionPlan = req.session.user.subscription_plan || 'free';
        
        if (!title || !targetDate) {
            return res.status(400).json({ error: 'Title and target date are required' });
        }
        
        // Insert the goal into the database
        db.run(
            'INSERT INTO goals (user_id, title, description, category, target_date) VALUES (?, ?, ?, ?, ?)',
            [userId, title, description, category, targetDate],
            async function(err) {
                if (err) {
                    console.error('Error creating goal:', err);
                    return res.status(500).json({ error: 'Failed to create goal' });
                }
                
                const goalId = this.lastID;
                
                try {
                    let milestones;
                    
                    // Only use AI service for premium users
                    if (subscriptionPlan === 'monthly' || subscriptionPlan === 'annual') {
                        // Generate milestones using the AI service for premium users
                        milestones = await aiService.generateMilestones(title, description, targetDate, category, subscriptionPlan);
                    } else {
                        // Create basic default milestones for free users
                        const startDate = new Date();
                        const endDate = new Date(targetDate);
                        const timeSpan = endDate.getTime() - startDate.getTime();
                        
                        milestones = [
                            {
                                title: "Get Started",
                                description: `Begin working on your goal to ${title}`,
                                targetDate: new Date(startDate.getTime() + timeSpan * 0.2).toISOString().split('T')[0],
                                metrics: [{ name: "Progress", target: 100, unit: "%" }]
                            },
                            {
                                title: "Make Initial Progress",
                                description: `Complete 25% of your goal: ${title}`,
                                targetDate: new Date(startDate.getTime() + timeSpan * 0.4).toISOString().split('T')[0],
                                metrics: [{ name: "Progress", target: 100, unit: "%" }]
                            },
                            {
                                title: "Reach Halfway Point",
                                description: `Complete 50% of your goal: ${title}`,
                                targetDate: new Date(startDate.getTime() + timeSpan * 0.6).toISOString().split('T')[0],
                                metrics: [{ name: "Progress", target: 100, unit: "%" }]
                            },
                            {
                                title: "Near Completion",
                                description: `Complete 75% of your goal: ${title}`,
                                targetDate: new Date(startDate.getTime() + timeSpan * 0.8).toISOString().split('T')[0],
                                metrics: [{ name: "Progress", target: 100, unit: "%" }]
                            },
                            {
                                title: "Final Achievement",
                                description: `Successfully complete your goal: ${title}`,
                                targetDate: targetDate,
                                metrics: [{ name: "Progress", target: 100, unit: "%" }]
                            }
                        ];
                    }
                    
                    // Insert milestones into the database
                    const insertPromises = milestones.map(milestone => {
                        return new Promise((resolve, reject) => {
                            const metricsJson = JSON.stringify(milestone.metrics || []);
                            
                            db.run(
                                'INSERT INTO milestones (goal_id, title, description, target_date, metrics, status) VALUES (?, ?, ?, ?, ?, ?)',
                                [goalId, milestone.title, milestone.description, milestone.targetDate, metricsJson, 'pending'],
                                function(err) {
                                    if (err) {
                                        console.error('Error creating milestone:', err);
                                        reject(err);
                                    } else {
                                        resolve(this.lastID);
                                    }
                                }
                            );
                        });
                    });
                    
                    await Promise.all(insertPromises);
                    
                    res.status(201).json({ 
                        id: goalId,
                        message: 'Goal created successfully with milestones',
                        redirectUrl: `/goals/detail/${goalId}`
                    });
                } catch (error) {
                    console.error('Error generating milestones:', error);
                    
                    // If milestone creation fails, still return success for the goal
                    res.status(201).json({ 
                        id: goalId,
                        message: 'Goal created successfully but there was an error generating milestones',
                        redirectUrl: `/goals/detail/${goalId}`
                    });
                }
            }
        );
    } catch (error) {
        console.error('Error in goal creation:', error);
        res.status(500).json({ error: 'Internal server error' });
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
            function(err) {
                if (err) {
                    console.error('Error creating log:', err);
                    return res.status(500).json({ error: 'Failed to create log' });
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
            function(err) {
                if (err) {
                    console.error('Error creating note:', err);
                    return res.status(500).json({ error: 'Failed to create note' });
                }
                
                // Return success
                res.status(201).json({
                    id: this.lastID,
                    goal_id: goalId,
                    title: title || 'Untitled Note',
                    content,
                    created_at: new Date().toISOString()
                });
            }
        );
    });
});

// Update a goal
router.put('/:id', (req, res) => {
    const goalId = req.params.id;
    const userId = req.session.user.id;
    const { title, description, category, targetDate, status } = req.body;
    
    // Update the goal
    db.run(
        'UPDATE goals SET title = ?, description = ?, category = ?, target_date = ?, status = ? WHERE id = ? AND user_id = ?',
        [title, description, category, targetDate, status, goalId, userId],
        function(err) {
            if (err) {
                console.error('Error updating goal:', err);
                return res.status(500).json({ error: 'Failed to update goal' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Goal not found or you do not have permission to edit it' });
            }
            
            // Return the updated goal
            res.status(200).json({
                id: goalId,
                user_id: userId,
                title,
                description,
                category,
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
router.put('/milestone/:id', (req, res) => {
    const milestoneId = req.params.id;
    const userId = req.session.user.id;
    const { title, description, targetDate, status, metrics } = req.body;
    
    // First verify that the milestone belongs to the user
    db.get(
        `SELECT m.* FROM milestones m 
         JOIN goals g ON m.goal_id = g.id 
         WHERE m.id = ? AND g.user_id = ?`,
        [milestoneId, userId],
        (err, milestone) => {
            if (err) {
                console.error('Error fetching milestone:', err);
                return res.status(500).json({ error: 'Failed to verify milestone ownership' });
            }
            
            if (!milestone) {
                return res.status(404).json({ error: 'Milestone not found or you do not have permission to edit it' });
            }
            
            // Convert metrics to JSON string
            const metricsJson = JSON.stringify(metrics || []);
            
            // Update the milestone
            db.run(
                'UPDATE milestones SET title = ?, description = ?, target_date = ?, status = ?, metrics = ? WHERE id = ?',
                [title, description, targetDate, status, metricsJson, milestoneId],
                function(err) {
                    if (err) {
                        console.error('Error updating milestone:', err);
                        return res.status(500).json({ error: 'Failed to update milestone' });
                    }
                    
                    // Return the updated milestone
                    res.status(200).json({
                        id: milestoneId,
                        goal_id: milestone.goal_id,
                        title,
                        description,
                        target_date: targetDate,
                        status,
                        metrics: metrics || []
                    });
                }
            );
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
                
                db.run(
                    'INSERT INTO milestones (goal_id, title, description, target_date, metrics, status) VALUES (?, ?, ?, ?, ?, ?)',
                    [goalId, milestone.title, milestone.description, targetDate, metricsJson, 'pending'],
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
            } catch (aiError) {
                console.error('Error generating custom milestone:', aiError);
                
                // Create a basic milestone if AI generation fails
                const basicMilestone = {
                    title: description,
                    description: "Complete this milestone as part of your goal.",
                    metrics: [{ name: "Completion", target: 100, unit: "%" }]
                };
                
                const metricsJson = JSON.stringify(basicMilestone.metrics);
                
                db.run(
                    'INSERT INTO milestones (goal_id, title, description, target_date, metrics, status) VALUES (?, ?, ?, ?, ?, ?)',
                    [goalId, basicMilestone.title, basicMilestone.description, targetDate, metricsJson, 'pending'],
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
            }
        });
    } catch (error) {
        console.error('Error in custom milestone creation:', error);
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

module.exports = router; 