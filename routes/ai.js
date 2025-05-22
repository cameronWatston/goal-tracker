const express = require('express');
const router = express.Router();
const aiService = require('../utils/aiService');
const { isAuthenticated } = require('../middleware/auth');
const { isPremium } = require('../middleware/subscription');
const db = require('../db/init');

// Serve AI assistant page
router.get('/assistant', isAuthenticated, (req, res) => {
    res.render('ai/assistant', {
        title: 'AI Goal Assistant - Goal Tracker',
        error: null,
        user: req.session.user
    });
});

// Middleware to check if AI features are available
const checkAIAccess = (req, res, next) => {
  // Check if user is logged in
  if (!req.session.user) {
    return res.status(401).json({
      error: 'Authentication required',
      redirectUrl: '/login'
    });
  }

  // Allow access only to premium users
  if (req.session.user.subscription === 'premium' || 
      req.session.user.subscription_plan === 'monthly' || 
      req.session.user.subscription_plan === 'annual') {
    return next();
  }
  
  // User doesn't have premium subscription - reject access
  return res.status(403).json({ 
    error: 'AI features require a premium subscription',
    upgradeUrl: '/subscription/upgrade'
  });
};

// Chat endpoint for the AI assistant
router.post('/chat', isAuthenticated, checkAIAccess, async (req, res) => {
  try {
    const { message, context } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get user context data
    const userData = await getUserContextData(req.session.user.id);
    
    // Get user's goals for context
    const goals = await getUserGoals(req.session.user.id);
    
    // Process the chat message
    const chatResponse = await aiService.processChatMessage(message, {
      user: userData,
      goals: goals,
      additionalContext: context || {}
    });
    
    res.json({ 
      success: true, 
      response: chatResponse.message,
      actions: chatResponse.actions || []
    });
  } catch (error) {
    console.error('Error processing chat message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// AI Goal Assistant - Create SMART goals
router.post('/smart-goal', isAuthenticated, checkAIAccess, async (req, res) => {
  try {
    const { userInput } = req.body;
    
    if (!userInput) {
      return res.status(400).json({ error: 'User input is required' });
    }
    
    // Get user data for context
    const userData = await getUserContextData(req.session.user.id);
    
    // Generate SMART goal
    const smartGoal = await aiService.createSmartGoal(userInput, userData);
    
    res.json({ success: true, data: smartGoal });
  } catch (error) {
    console.error('Error generating SMART goal:', error);
    res.status(500).json({ error: 'Failed to generate SMART goal' });
  }
});

// Automated Goal Breakdown - Action plan
router.post('/action-plan', isAuthenticated, checkAIAccess, async (req, res) => {
  try {
    const { goalId } = req.body;
    
    if (!goalId) {
      return res.status(400).json({ error: 'Goal ID is required' });
    }
    
    // Get goal details
    const goalDetails = await getGoalDetails(goalId, req.session.user.id);
    
    if (!goalDetails) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Generate action plan
    const actionPlan = await aiService.createActionPlan(goalDetails);
    
    res.json({ success: true, data: actionPlan });
  } catch (error) {
    console.error('Error generating action plan:', error);
    res.status(500).json({ error: 'Failed to generate action plan' });
  }
});

// Motivational Nudges
router.post('/motivational-nudge', isAuthenticated, checkAIAccess, async (req, res) => {
  try {
    const { goalId } = req.body;
    
    if (!goalId) {
      return res.status(400).json({ error: 'Goal ID is required' });
    }
    
    // Get user data and goal progress
    const userData = await getUserContextData(req.session.user.id);
    const goalProgress = await getGoalProgress(goalId, req.session.user.id);
    
    if (!goalProgress) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Generate motivational nudge
    const motivationalNudge = await aiService.generateMotivationalNudge(userData, goalProgress);
    
    res.json({ success: true, data: motivationalNudge });
  } catch (error) {
    console.error('Error generating motivational nudge:', error);
    res.status(500).json({ error: 'Failed to generate motivational nudge' });
  }
});

// Goal Completion Forecasting
router.post('/forecast', isAuthenticated, checkAIAccess, async (req, res) => {
  try {
    const { goalId } = req.body;
    
    if (!goalId) {
      return res.status(400).json({ error: 'Goal ID is required' });
    }
    
    // Get goal details and progress data
    const goalDetails = await getGoalDetails(goalId, req.session.user.id);
    const progressData = await getGoalProgress(goalId, req.session.user.id);
    
    if (!goalDetails) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Generate forecast
    const forecast = await aiService.forecastGoalCompletion(goalDetails, progressData);
    
    res.json({ success: true, data: forecast });
  } catch (error) {
    console.error('Error generating forecast:', error);
    res.status(500).json({ error: 'Failed to generate forecast' });
  }
});

// Progress Insights & Reports
router.post('/insights', isAuthenticated, checkAIAccess, async (req, res) => {
  try {
    const { goalId } = req.body;
    
    if (!goalId) {
      return res.status(400).json({ error: 'Goal ID is required' });
    }
    
    // Get goal details and progress data
    const goalDetails = await getGoalDetails(goalId, req.session.user.id);
    const progressData = await getGoalProgress(goalId, req.session.user.id);
    
    if (!goalDetails) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Generate insights
    const insights = await aiService.generateProgressInsights(goalDetails, progressData);
    
    res.json({ success: true, data: insights });
  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

// Natural Language Logging
router.post('/process-update', isAuthenticated, checkAIAccess, async (req, res) => {
  try {
    const { goalId, userInput } = req.body;
    
    if (!goalId || !userInput) {
      return res.status(400).json({ error: 'Goal ID and user input are required' });
    }
    
    // Get goal details
    const goalDetails = await getGoalDetails(goalId, req.session.user.id);
    
    if (!goalDetails) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Process natural language update
    const processedUpdate = await aiService.processNaturalLanguageUpdate(userInput, goalDetails);
    
    // Save the processed update
    await saveProcessedUpdate(goalId, req.session.user.id, processedUpdate);
    
    res.json({ success: true, data: processedUpdate });
  } catch (error) {
    console.error('Error processing update:', error);
    res.status(500).json({ error: 'Failed to process update' });
  }
});

// Dashboard Insights - Provides AI insights for the dashboard
router.post('/dashboard-insights', isAuthenticated, checkAIAccess, async (req, res) => {
  try {
    const { goals } = req.body;
    
    if (!goals || !Array.isArray(goals)) {
      return res.status(400).json({ error: 'Valid goals data is required' });
    }
    
    // Get user data for context
    const userData = await getUserContextData(req.session.user.id);
    
    // Get upcoming milestones for all goals
    const upcomingMilestones = await getUpcomingMilestones(goals.map(g => g.id));
    
    // Calculate basic stats
    const activeGoals = goals.filter(g => g.status === 'active');
    const completedGoals = goals.filter(g => g.status === 'completed');
    const totalGoals = goals.length;
    const completionRate = totalGoals > 0 ? Math.round((completedGoals.length / totalGoals) * 100) : 0;
    
    // Get goal with nearest deadline
    const now = new Date();
    let priorityGoal = null;
    let shortestTimeRemaining = Infinity;
    
    activeGoals.forEach(goal => {
      const targetDate = new Date(goal.target_date);
      const timeRemaining = targetDate - now;
      
      if (timeRemaining > 0 && timeRemaining < shortestTimeRemaining) {
        shortestTimeRemaining = timeRemaining;
        priorityGoal = goal;
      }
    });
    
    // Create insights object
    const insights = {
      username: userData.username,
      summary: generateSummary(activeGoals.length, completedGoals.length, completionRate),
      topPriority: priorityGoal ? generatePriorityMessage(priorityGoal, shortestTimeRemaining) : null,
      priorityGoalId: priorityGoal?.id || null,
      recommendations: generateRecommendations(goals, upcomingMilestones),
      completionRate: completionRate,
      activeGoals: activeGoals.length,
      completedGoals: completedGoals.length,
      upcomingMilestones: formatUpcomingMilestones(upcomingMilestones, goals)
    };
    
    res.json({ success: true, data: insights });
  } catch (error) {
    console.error('Error generating dashboard insights:', error);
    res.status(500).json({ error: 'Failed to generate dashboard insights' });
  }
});

// Get weekly targets for a goal
router.get('/weekly-targets', isAuthenticated, checkAIAccess, async (req, res) => {
  try {
    const { goalId } = req.query;
    
    if (!goalId) {
      return res.status(400).json({ error: 'Goal ID is required' });
    }
    
    // Get goal details
    const goalDetails = await getGoalDetails(goalId, req.session.user.id);
    
    if (!goalDetails) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Get progress data for context
    const progressData = await getGoalProgress(goalId, req.session.user.id);
    
    // Generate weekly targets using AI
    const weeklyTargets = await aiService.generateWeeklyTargets(goalDetails, progressData);
    
    res.json({ success: true, data: weeklyTargets });
  } catch (error) {
    console.error('Error generating weekly targets:', error);
    res.status(500).json({ error: 'Failed to generate weekly targets' });
  }
});

// Get AI insights for a specific goal
router.get('/insights', isAuthenticated, checkAIAccess, async (req, res) => {
  try {
    const { goalId } = req.query;
    
    if (!goalId) {
      return res.status(400).json({ error: 'Goal ID is required' });
    }
    
    // Get goal details and progress data
    const goalDetails = await getGoalDetails(goalId, req.session.user.id);
    const progressData = await getGoalProgress(goalId, req.session.user.id);
    
    if (!goalDetails) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    
    // Get key insight for the dashboard
    const insight = await aiService.generateKeyInsight(goalDetails, progressData);
    
    res.json({ success: true, data: insight });
  } catch (error) {
    console.error('Error generating insight:', error);
    res.status(500).json({ error: 'Failed to generate insight' });
  }
});

// Helper functions to get data from the database
async function getUserContextData(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT username, email FROM users WHERE id = ?`,
      [userId],
      async (err, user) => {
        if (err) return reject(err);
        if (!user) return resolve({});
        
        // Get past goals
        db.all(
          `SELECT title, description FROM goals 
           WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`,
          [userId],
          (err, goals) => {
            if (err) return reject(err);
            
            // Get interests (could be from a separate table in a real app)
            const interests = goals?.map(g => g.title).join(', ') || 'Not available';
            
            // Return user context data
            resolve({
              username: user.username,
              pastGoals: goals?.map(g => g.title).join(', ') || 'None',
              interests: interests,
              commonObstacles: 'Time constraints, motivation issues' // Placeholder
            });
          }
        );
      }
    );
  });
}

// Helper function to get user's goals
async function getUserGoals(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, title, description, category, status, target_date, created_at 
       FROM goals WHERE user_id = ? ORDER BY created_at DESC`,
      [userId],
      (err, goals) => {
        if (err) return reject(err);
        resolve(goals || []);
      }
    );
  });
}

async function getGoalDetails(goalId, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, title, description, target_date, created_at 
       FROM goals WHERE id = ? AND user_id = ?`,
      [goalId, userId],
      (err, goal) => {
        if (err) return reject(err);
        if (!goal) return resolve(null);
        
        // Format the goal details
        resolve({
          id: goal.id,
          title: goal.title,
          description: goal.description,
          timeframe: goal.target_date ? 
            `Complete by ${new Date(goal.target_date).toLocaleDateString()}` : 
            'No target date specified'
        });
      }
    );
  });
}

async function getGoalProgress(goalId, userId) {
  return new Promise((resolve, reject) => {
    // Get progress updates
    db.all(
      `SELECT * FROM progress_updates 
       WHERE goal_id = ? ORDER BY created_at DESC LIMIT 10`,
      [goalId],
      (err, updates) => {
        if (err) return reject(err);
        
        // Calculate days active
        const uniqueDays = new Set();
        updates.forEach(update => {
          const date = new Date(update.created_at).toLocaleDateString();
          uniqueDays.add(date);
        });
        
        // Calculate percentage complete (placeholder logic)
        const percentComplete = Math.min(
          Math.round((updates.length / 10) * 100), 
          100
        );
        
        // Get recent activity
        const recentActivity = updates.length > 0 ? 
          updates[0].content : 'No recent activity';
        
        // Return progress data
        resolve({
          daysActive: uniqueDays.size,
          percentComplete: percentComplete,
          recentActivity: recentActivity,
          updates: updates,
          activityPattern: uniqueDays.size > 3 ? 'Regular' : 'Irregular',
          consistencyScore: percentComplete > 50 ? 'Good' : 'Needs improvement',
          challengesNoted: 'None specified' // Placeholder
        });
      }
    );
  });
}

async function saveProcessedUpdate(goalId, userId, processedUpdate) {
  return new Promise((resolve, reject) => {
    // Save the structured data
    const progressContent = processedUpdate.progressMade || 'Update logged';
    
    db.run(
      `INSERT INTO progress_updates (goal_id, user_id, content, metadata)
       VALUES (?, ?, ?, ?)`,
      [goalId, userId, progressContent, JSON.stringify(processedUpdate)],
      function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      }
    );
  });
}

// Helper function to generate summary message
function generateSummary(activeCount, completedCount, completionRate) {
  if (activeCount === 0 && completedCount === 0) {
    return "Welcome to your Goal Tracker! You haven't created any goals yet. Let's get started by creating your first goal.";
  }
  
  if (activeCount === 0 && completedCount > 0) {
    return `Congratulations! You've completed all ${completedCount} of your goals. Time to set new challenges!`;
  }
  
  if (completionRate > 75) {
    return `You're making excellent progress! You've completed ${completedCount} goals (${completionRate}% completion rate) and have ${activeCount} active goals.`;
  } else if (completionRate > 50) {
    return `You're making good progress with a ${completionRate}% completion rate. You have ${activeCount} active goals to focus on.`;
  } else if (completionRate > 25) {
    return `You're making steady progress with ${activeCount} active goals and a ${completionRate}% overall completion rate.`;
  } else {
    return `You have ${activeCount} active goals to work on. Let's focus on making progress one step at a time!`;
  }
}

// Helper function to generate priority message
function generatePriorityMessage(goal, timeRemaining) {
  const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));
  
  if (daysRemaining <= 1) {
    return `"${goal.title}" is due today! This should be your top priority.`;
  } else if (daysRemaining <= 3) {
    return `"${goal.title}" is due in ${daysRemaining} days. This needs your immediate attention.`;
  } else if (daysRemaining <= 7) {
    return `"${goal.title}" is due in ${daysRemaining} days. Focus on this goal this week.`;
  } else {
    return `"${goal.title}" is your next upcoming deadline in ${daysRemaining} days.`;
  }
}

// Helper function to generate recommendations
function generateRecommendations(goals, upcomingMilestones) {
  const recommendations = [];
  
  // Check for goals with no recent activity
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  
  const inactiveGoals = goals.filter(g => 
    g.status === 'active' && 
    new Date(g.last_updated || g.created_at) < twoWeeksAgo
  );
  
  if (inactiveGoals.length > 0) {
    recommendations.push({
      text: `You have ${inactiveGoals.length} goals with no recent activity. Consider updating your progress or revising these goals.`,
      icon: 'fa-history'
    });
  }
  
  // Check for goals with approaching deadlines
  const priorityMilestones = upcomingMilestones.filter(m => m.daysRemaining <= 7);
  if (priorityMilestones.length > 0) {
    recommendations.push({
      text: `You have ${priorityMilestones.length} milestones due within the next week. Focus on these to stay on track.`,
      icon: 'fa-calendar-day'
    });
  }
  
  // Add general recommendations
  if (goals.filter(g => g.status === 'active').length > 0) {
    recommendations.push({
      text: "Break down your largest goal into smaller milestones for better progress tracking and motivation.",
      icon: 'fa-project-diagram'
    });
  }
  
  if (goals.filter(g => g.status === 'active').length >= 3) {
    recommendations.push({
      text: "Having multiple active goals? Consider prioritizing them to focus your energy more effectively.",
      icon: 'fa-sort-amount-up'
    });
  }
  
  if (goals.filter(g => g.status === 'completed').length > 0) {
    recommendations.push({
      text: "Reflect on your completed goals. What strategies worked well that you can apply to current goals?",
      icon: 'fa-lightbulb'
    });
  }
  
  // If no specific recommendations, add a generic one
  if (recommendations.length === 0) {
    recommendations.push({
      text: "Set specific, measurable milestones for your goals to track progress more effectively.",
      icon: 'fa-bullseye'
    });
  }
  
  return recommendations;
}

// Helper function to get upcoming milestones
async function getUpcomingMilestones(goalIds) {
  if (!goalIds || goalIds.length === 0) {
    return [];
  }
  
  return new Promise((resolve, reject) => {
    const placeholders = goalIds.map(() => '?').join(',');
    
    db.all(
      `SELECT m.*, g.title as goal_title 
       FROM milestones m
       JOIN goals g ON m.goal_id = g.id
       WHERE m.goal_id IN (${placeholders}) 
       AND m.status != 'completed'
       ORDER BY m.target_date ASC
       LIMIT 5`,
      [...goalIds],
      (err, milestones) => {
        if (err) return reject(err);
        
        // Calculate days remaining for each milestone
        const now = new Date();
        const milestonesWithDaysRemaining = milestones.map(milestone => {
          const targetDate = new Date(milestone.target_date);
          const daysRemaining = Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24));
          
          return {
            ...milestone,
            daysRemaining
          };
        });
        
        resolve(milestonesWithDaysRemaining);
      }
    );
  });
}

// Helper function to format upcoming milestones for display
function formatUpcomingMilestones(milestones, goals) {
  return milestones.map(milestone => {
    let dueIn = '';
    
    if (milestone.daysRemaining <= 0) {
      dueIn = 'Overdue';
    } else if (milestone.daysRemaining === 1) {
      dueIn = 'Due tomorrow';
    } else if (milestone.daysRemaining < 7) {
      dueIn = `Due in ${milestone.daysRemaining} days`;
    } else {
      dueIn = new Date(milestone.target_date).toLocaleDateString();
    }
    
    const goal = goals.find(g => g.id === milestone.goal_id);
    
    return {
      id: milestone.id,
      title: milestone.title,
      dueIn: dueIn,
      goalId: milestone.goal_id,
      goalTitle: goal ? goal.title : milestone.goal_title || 'Unknown Goal'
    };
  });
}

module.exports = router; 