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
    
    // Get detailed analytics data
    const analyticsData = await getDetailedAnalytics(req.session.user.id, goals);
    
    // Analyze user patterns and behavior
    const behaviorAnalysis = await analyzeBehaviorPatterns(req.session.user.id, goals);
    
    // Get upcoming milestones for all goals
    const upcomingMilestones = await getUpcomingMilestones(goals.map(g => g.id));
    
    // Calculate comprehensive stats
    const activeGoals = goals.filter(g => g.status === 'active');
    const completedGoals = goals.filter(g => g.status === 'completed');
    const totalGoals = goals.length;
    const completionRate = totalGoals > 0 ? Math.round((completedGoals.length / totalGoals) * 100) : 0;
    
    // Analyze goal urgency and priority
    const urgencyAnalysis = analyzeGoalUrgency(activeGoals);
    
    // Generate intelligent insights based on real data
    const insights = {
      username: userData.username,
      summary: generateIntelligentSummary(analyticsData, behaviorAnalysis, completionRate),
      topPriority: urgencyAnalysis.priority,
      priorityGoalId: urgencyAnalysis.goalId,
      recommendations: generateDataDrivenRecommendations(analyticsData, behaviorAnalysis, goals),
      completionRate: completionRate,
      activeGoals: activeGoals.length,
      completedGoals: completedGoals.length,
      upcomingMilestones: formatUpcomingMilestones(upcomingMilestones, goals),
      patterns: behaviorAnalysis.patterns,
      insights: analyticsData.insights
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

// Enhanced analytics function
async function getDetailedAnalytics(userId, goals) {
  return new Promise((resolve, reject) => {
    // Get goal logs (check-ins) for analysis
    db.all(
      `SELECT gl.*, g.title as goal_title, g.category 
       FROM goal_logs gl 
       JOIN goals g ON gl.goal_id = g.id 
       WHERE g.user_id = ? 
       ORDER BY gl.created_at DESC LIMIT 50`,
      [userId],
      async (err, logs) => {
        if (err) return reject(err);
        
        // Get goal notes for sentiment analysis
        db.all(
          `SELECT gn.*, g.title as goal_title, g.category 
           FROM goal_notes gn 
           JOIN goals g ON gn.goal_id = g.id 
           WHERE g.user_id = ? 
           ORDER BY gn.created_at DESC LIMIT 30`,
          [userId],
          (err, notes) => {
            if (err) return reject(err);
            
            // Analyze the data
            const analytics = {
              totalCheckIns: logs.length,
              recentActivity: logs.slice(0, 10),
              checkInFrequency: calculateCheckInFrequency(logs),
              moodTrends: analyzeMoodTrends(logs),
              categoryActivity: analyzeCategoryActivity(logs, goals),
              notesSentiment: analyzeNotesSentiment(notes),
              progressConsistency: calculateProgressConsistency(logs),
              insights: generateProgressInsights(logs, notes, goals)
            };
            
            resolve(analytics);
          }
        );
      }
    );
  });
}

// Analyze user behavior patterns
async function analyzeBehaviorPatterns(userId, goals) {
  return new Promise((resolve, reject) => {
    // Get milestone completion data
    db.all(
      `SELECT m.*, g.title as goal_title 
       FROM milestones m 
       JOIN goals g ON m.goal_id = g.id 
       WHERE g.user_id = ? 
       ORDER BY m.created_at DESC`,
      [userId],
      (err, milestones) => {
        if (err) return reject(err);
        
        const patterns = {
          completionPatterns: analyzeMilestoneCompletionPatterns(milestones),
          procrastinationTendencies: identifyProcrastinationPatterns(milestones, goals),
          mostProductiveTimes: analyzeMostProductiveTimes(milestones),
          goalSwitchingBehavior: analyzeGoalSwitchingBehavior(goals),
          consistencyScore: calculateConsistencyScore(milestones)
        };
        
        resolve({ patterns, rawData: { milestones } });
      }
    );
  });
}

// Helper functions for analysis
function calculateCheckInFrequency(logs) {
  if (logs.length === 0) return 0;
  
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  const recentLogs = logs.filter(log => new Date(log.created_at) > thirtyDaysAgo);
  
  return Math.round(recentLogs.length / 30 * 7); // Weekly frequency
}

function analyzeMoodTrends(logs) {
  const moodCounts = {};
  logs.forEach(log => {
    const mood = log.mood || 'neutral';
    moodCounts[mood] = (moodCounts[mood] || 0) + 1;
  });
  
  const totalLogs = logs.length;
  const moodPercentages = {};
  
  Object.keys(moodCounts).forEach(mood => {
    moodPercentages[mood] = Math.round((moodCounts[mood] / totalLogs) * 100);
  });
  
  return moodPercentages;
}

function analyzeCategoryActivity(logs, goals) {
  const categoryActivity = {};
  
  logs.forEach(log => {
    const goal = goals.find(g => g.id == log.goal_id);
    if (goal) {
      const category = goal.category || 'other';
      categoryActivity[category] = (categoryActivity[category] || 0) + 1;
    }
  });
  
  return categoryActivity;
}

function analyzeNotesSentiment(notes) {
  if (notes.length === 0) return { positive: 0, neutral: 100, negative: 0 };
  
  // Simple sentiment analysis based on keywords
  let positive = 0, negative = 0, neutral = 0;
  
  const positiveWords = ['good', 'great', 'excellent', 'progress', 'achieved', 'success', 'happy', 'excited', 'motivated'];
  const negativeWords = ['difficult', 'hard', 'struggle', 'failed', 'stuck', 'frustrated', 'tired', 'overwhelmed'];
  
  notes.forEach(note => {
    const content = (note.content || '').toLowerCase();
    let positiveCount = 0, negativeCount = 0;
    
    positiveWords.forEach(word => {
      if (content.includes(word)) positiveCount++;
    });
    
    negativeWords.forEach(word => {
      if (content.includes(word)) negativeCount++;
    });
    
    if (positiveCount > negativeCount) positive++;
    else if (negativeCount > positiveCount) negative++;
    else neutral++;
  });
  
  const total = notes.length;
  return {
    positive: Math.round((positive / total) * 100),
    neutral: Math.round((neutral / total) * 100),
    negative: Math.round((negative / total) * 100)
  };
}

function generateIntelligentSummary(analytics, behaviorAnalysis, completionRate) {
  const checkInFreq = analytics.checkInFrequency;
  const consistency = behaviorAnalysis.patterns.consistencyScore;
  
  if (completionRate >= 80) {
    return `Excellent progress! You're maintaining an ${completionRate}% completion rate with ${checkInFreq} check-ins per week. Your consistency is paying off!`;
  } else if (completionRate >= 60) {
    return `Good momentum! ${completionRate}% completion rate shows solid progress. Consider increasing your ${checkInFreq} weekly check-ins for even better results.`;
  } else if (checkInFreq >= 3) {
    return `You're actively engaged with ${checkInFreq} check-ins per week! Focus on converting this engagement into completed milestones to boost your ${completionRate}% completion rate.`;
  } else if (analytics.totalCheckIns === 0) {
    return `Your goals are set up! Start with regular check-ins to track progress and stay motivated. Even 2-3 check-ins per week can significantly improve success rates.`;
  } else {
    return `Let's get back on track! Increase your check-in frequency from ${checkInFreq} times per week and focus on completing current milestones to improve your progress.`;
  }
}

function generateDataDrivenRecommendations(analytics, behaviorAnalysis, goals) {
  const recommendations = [];
  
  // Check-in frequency recommendation
  if (analytics.checkInFrequency < 2) {
    recommendations.push({
      text: "Increase check-in frequency to at least 3 times per week for better goal tracking",
      category: "Engagement",
      icon: "fa-calendar-check"
    });
  }
  
  // Mood-based recommendations
  const moodTrends = analytics.moodTrends;
  if (moodTrends.negative && moodTrends.negative > 30) {
    recommendations.push({
      text: "Consider breaking down challenging goals into smaller, more manageable milestones",
      category: "Strategy",
      icon: "fa-tasks"
    });
  }
  
  // Category-based recommendations
  const categoryActivity = analytics.categoryActivity;
  const mostActiveCategory = Object.keys(categoryActivity).reduce((a, b) => 
    categoryActivity[a] > categoryActivity[b] ? a : b, '');
  
  if (mostActiveCategory) {
    recommendations.push({
      text: `You're most active in ${mostActiveCategory} goals. Consider leveraging this momentum for other areas`,
      category: "Focus",
      icon: "fa-bullseye"
    });
  }
  
  // Consistency recommendations
  if (behaviorAnalysis.patterns.consistencyScore < 50) {
    recommendations.push({
      text: "Set daily reminders to maintain consistent progress on your goals",
      category: "Consistency",
      icon: "fa-bell"
    });
  }
  
  // Progress-based recommendations
  const staleGoals = goals.filter(goal => {
    const daysSinceUpdate = Math.floor((new Date() - new Date(goal.updated_at || goal.created_at)) / (1000 * 60 * 60 * 24));
    return daysSinceUpdate > 7 && goal.status === 'active';
  });
  
  if (staleGoals.length > 0) {
    recommendations.push({
      text: `${staleGoals.length} goals haven't been updated recently. Schedule time to review and update them`,
      category: "Maintenance",
      icon: "fa-sync"
    });
  }
  
  // Default helpful recommendations
  if (recommendations.length < 3) {
    const defaultRecs = [
      {
        text: "Review your goals weekly to ensure they're still aligned with your priorities",
        category: "Planning",
        icon: "fa-clipboard-list"
      },
      {
        text: "Celebrate small wins to maintain motivation throughout your goal journey",
        category: "Motivation",
        icon: "fa-trophy"
      },
      {
        text: "Share your progress with friends or family for additional accountability",
        category: "Social",
        icon: "fa-users"
      }
    ];
    
    defaultRecs.forEach(rec => {
      if (recommendations.length < 4) {
        recommendations.push(rec);
      }
    });
  }
  
  return recommendations.slice(0, 4); // Limit to 4 recommendations
}

function analyzeGoalUrgency(activeGoals) {
  if (activeGoals.length === 0) {
    return { priority: null, goalId: null };
  }
  
  const now = new Date();
  let mostUrgent = null;
  let shortestTimeRemaining = Infinity;
  
  activeGoals.forEach(goal => {
    const targetDate = new Date(goal.target_date);
    const timeRemaining = targetDate - now;
    
    if (timeRemaining > 0 && timeRemaining < shortestTimeRemaining) {
      shortestTimeRemaining = timeRemaining;
      mostUrgent = goal;
    }
  });
  
  if (mostUrgent) {
    const daysRemaining = Math.ceil(shortestTimeRemaining / (1000 * 60 * 60 * 24));
    
    if (daysRemaining <= 7) {
      return {
        priority: `"${mostUrgent.title}" is due in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}! Focus your energy here to meet the deadline.`,
        goalId: mostUrgent.id
      };
    } else if (daysRemaining <= 30) {
      return {
        priority: `"${mostUrgent.title}" needs attention - only ${daysRemaining} days remaining. Time to accelerate progress on this goal.`,
        goalId: mostUrgent.id
      };
    }
  }
  
  return { priority: null, goalId: null };
}

// Additional helper functions
function calculateProgressConsistency(logs) {
  if (logs.length < 7) return 0;
  
  // Calculate consistency based on regular check-ins over time
  const dates = logs.map(log => new Date(log.created_at).toDateString());
  const uniqueDates = [...new Set(dates)];
  const daysCovered = uniqueDates.length;
  const totalDays = Math.floor((new Date() - new Date(logs[logs.length - 1].created_at)) / (1000 * 60 * 60 * 24));
  
  return Math.min(100, Math.round((daysCovered / Math.max(totalDays, 1)) * 100));
}

function generateProgressInsights(logs, notes, goals) {
  const insights = [];
  
  // Activity insight
  if (logs.length > 0) {
    const recentLogs = logs.filter(log => {
      const logDate = new Date(log.created_at);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return logDate > weekAgo;
    });
    
    if (recentLogs.length >= 3) {
      insights.push("High activity this week - you're staying engaged with your goals!");
    } else if (recentLogs.length === 0) {
      insights.push("No check-ins this week - consider scheduling regular progress reviews.");
    }
  }
  
  return insights;
}

function analyzeMilestoneCompletionPatterns(milestones) {
  const completed = milestones.filter(m => m.status === 'completed');
  const total = milestones.length;
  
  if (total === 0) return { rate: 0, trend: 'insufficient_data' };
  
  const completionRate = (completed.length / total) * 100;
  
  return {
    rate: Math.round(completionRate),
    trend: completionRate >= 70 ? 'excellent' : completionRate >= 50 ? 'good' : 'needs_improvement'
  };
}

function identifyProcrastinationPatterns(milestones, goals) {
  // Simple procrastination detection based on overdue milestones
  const now = new Date();
  const overdue = milestones.filter(m => {
    return m.status !== 'completed' && new Date(m.target_date) < now;
  });
  
  return {
    overdueCount: overdue.length,
    procrastinationRisk: overdue.length > milestones.length * 0.3 ? 'high' : 'low'
  };
}

function analyzeMostProductiveTimes(milestones) {
  // This would require more detailed timestamp analysis
  // For now, return a placeholder
  return {
    bestDay: 'Monday',
    bestTime: 'Morning',
    confidence: 'low'
  };
}

function analyzeGoalSwitchingBehavior(goals) {
  // Analyze if user frequently switches between goals
  const recentGoals = goals.filter(g => {
    const createdDate = new Date(g.created_at);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return createdDate > monthAgo;
  });
  
  return {
    recentGoalCount: recentGoals.length,
    switchingFrequency: recentGoals.length > 5 ? 'high' : 'normal'
  };
}

function calculateConsistencyScore(milestones) {
  if (milestones.length === 0) return 0;
  
  const completed = milestones.filter(m => m.status === 'completed').length;
  const total = milestones.length;
  
  return Math.round((completed / total) * 100);
}

module.exports = router; 