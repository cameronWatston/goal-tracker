require('dotenv').config();
const OpenAI = require('openai');

// Initialize OpenAI with API key from environment variables
let openai;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    console.log('OpenAI initialized with API key');
  } else {
    console.log('No OpenAI API key found, using mock responses');
  }
} catch (error) {
  console.error('Error initializing OpenAI:', error);
}

/**
 * Generic function to call OpenAI API or return mock response
 */
async function callOpenAI(prompt, mockResponse) {
  // Always ensure we have a valid mock response to fall back on
  let validMockResponse = mockResponse;
  if (typeof mockResponse === 'string' && !mockResponse.startsWith('{') && !mockResponse.startsWith('[')) {
    // If it's not JSON formatted, wrap it in a simple object
    validMockResponse = { message: mockResponse };
  }

  if (openai && process.env.OPENAI_API_KEY) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful AI assistant for a goal tracking application." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      });
      
      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      console.log('Falling back to mock response');
      return validMockResponse;
    }
  } else {
    console.log('Using mock response - no API key configured');
    return validMockResponse;
  }
}

/**
 * Process chat messages from the AI chatbot
 */
async function processChatMessage(message, context) {
  const { user, goals, additionalContext } = context;
  
  // Create a context-aware prompt
  const prompt = `
    You are an AI Goal Assistant for a goal tracking application. Respond to the user's message in a helpful, 
    motivational, and concise way. Focus on helping them achieve their goals.
    
    User profile:
    - Name: ${user?.username || 'User'}
    - Current active goals: ${formatGoalsForContext(goals)}
    
    If the user asks about creating a goal, tracking progress, or needs advice on achieving their goals, 
    provide specific, actionable guidance. If they want to create a new goal or update progress on an existing goal, 
    you can suggest this as an action.
    
    User message: "${message}"
    
    Respond in a friendly, motivational tone. Keep your response under 150 words unless a detailed explanation is necessary.
    If appropriate, suggest an action that could be taken (creating a goal, viewing progress, etc.)
  `;

  // Mock response for when no API key is available
  const mockResponse = {
    message: generateMockChatResponse(message, goals),
    actions: generateMockActions(message, goals)
  };

  // Call API or use mock response
  const result = await callOpenAI(prompt, JSON.stringify(mockResponse));
  
  try {
    // Try to parse the result as JSON
    const parsedResult = typeof result === 'string' && result.startsWith('{') ? 
      JSON.parse(result) : { message: result };
    
    // If the AI didn't return actions, try to generate some based on the message
    if (!parsedResult.actions && parsedResult.message) {
      parsedResult.actions = inferActionsFromMessage(message, parsedResult.message, goals);
    }
    
    return parsedResult;
  } catch (e) {
    // If parsing fails, return the result as a plain message
    return { 
      message: result,
      actions: inferActionsFromMessage(message, result, goals)
    };
  }
}

/**
 * Format goals list for the context
 */
function formatGoalsForContext(goals) {
  if (!goals || goals.length === 0) {
    return "No active goals";
  }
  
  return goals
    .filter(g => g.status === 'active')
    .map(g => `"${g.title}" (due: ${new Date(g.target_date).toLocaleDateString()})`)
    .join(', ');
}

/**
 * Generate a mock chat response
 */
function generateMockChatResponse(message, goals) {
  message = message.toLowerCase();
  
  if (message.includes('create') && message.includes('goal')) {
    return "I'd be happy to help you create a new goal! What kind of goal do you have in mind? For best results, try to make it specific, measurable, and time-bound.";
  }
  
  if (message.includes('progress') || message.includes('update')) {
    return "Tracking your progress is a great way to stay motivated! Would you like to log progress for a specific goal? I can help you with that.";
  }
  
  if (message.includes('motivat') || message.includes('stuck') || message.includes('help')) {
    return "Remember why you started this journey! Break down your goals into smaller tasks, celebrate small wins, and don't forget to be kind to yourself when things get tough. What specific challenge are you facing right now?";
  }
  
  if (message.includes('hello') || message.includes('hi ') || message === 'hi') {
    return `Hello! I'm your AI Goal Assistant. I'm here to help you track, manage, and achieve your goals. What can I help you with today?`;
  }
  
  if (goals && goals.length > 0) {
    return `I see you have ${goals.length} goals set up. How can I help you make progress on them today? I can provide advice, help you track updates, or analyze your progress patterns.`;
  }
  
  return "I'm here to help you achieve your goals! I can assist with creating SMART goals, breaking them down into manageable steps, tracking your progress, or providing motivation when you need it. What would you like help with?";
}

/**
 * Generate mock actions based on user message
 */
function generateMockActions(message, goals) {
  message = message.toLowerCase();
  const actions = [];
  
  if (message.includes('create') && message.includes('goal')) {
    // Extract goal title from message if possible
    let title = '';
    if (message.includes('goal to ')) {
      title = message.split('goal to ')[1].split(/[.!?]$/)[0];
    } else if (message.includes('goal:')) {
      title = message.split('goal:')[1].split(/[.!?]$/)[0];
    }
    
    if (title) {
      actions.push({
        type: 'createGoal',
        title: title.trim().charAt(0).toUpperCase() + title.trim().slice(1)
      });
    }
  }
  
  if (message.includes('dashboard') || message.includes('goals')) {
    actions.push({
      type: 'redirect',
      url: '/goals/dashboard',
      description: 'your goals dashboard'
    });
  }
  
  return actions;
}

/**
 * Infer possible actions based on the message and response
 */
function inferActionsFromMessage(userMessage, aiResponse, goals) {
  const actions = [];
  userMessage = userMessage.toLowerCase();
  aiResponse = aiResponse.toLowerCase();
  
  // Check for goal creation intent
  if ((userMessage.includes('create') && userMessage.includes('goal')) || 
      (aiResponse.includes('create') && aiResponse.includes('goal'))) {
    // Try to extract a goal title from the user message
    let title = '';
    if (userMessage.includes('goal to ')) {
      title = userMessage.split('goal to ')[1].split(/[.!?]$/)[0];
    } else if (userMessage.includes('goal:')) {
      title = userMessage.split('goal:')[1].split(/[.!?]$/)[0];
    } else if (userMessage.includes('goal for ')) {
      title = userMessage.split('goal for ')[1].split(/[.!?]$/)[0];
    }
    
    if (title) {
      actions.push({
        type: 'createGoal',
        title: title.trim().charAt(0).toUpperCase() + title.trim().slice(1)
      });
    }
  }
  
  // Check for dashboard/view goals intent
  if (userMessage.includes('show') && userMessage.includes('goals') ||
      userMessage.includes('view') && userMessage.includes('goals') ||
      userMessage.includes('dashboard')) {
    actions.push({
      type: 'redirect',
      url: '/goals/dashboard',
      description: 'your goals dashboard'
    });
  }
  
  // Check for progress update intent
  if (goals && goals.length > 0 && 
      (userMessage.includes('update') || userMessage.includes('progress')) && 
      (userMessage.includes('goal') || userMessage.includes('milestone'))) {
    // Try to match a specific goal
    const goalKeywords = userMessage.split(' ');
    const matchedGoal = goals.find(goal => {
      const titleWords = goal.title.toLowerCase().split(' ');
      return goalKeywords.some(keyword => 
        titleWords.includes(keyword) && keyword.length > 3
      );
    });
    
    if (matchedGoal) {
      actions.push({
        type: 'updateProgress',
        goalId: matchedGoal.id,
        content: `Updated progress on "${matchedGoal.title}"`
      });
    }
  }
  
  return actions;
}

/**
 * AI Goal Assistant - Helps users create SMART goals
 */
async function createSmartGoal(userInput, userData) {
  // Basic validation
  if (!userInput || typeof userInput !== 'string' || userInput.trim().length < 3) {
    return {
      error: true,
      title: "Invalid input",
      description: "Please provide a more detailed description of your goal.",
      metrics: "Not available",
      timeframe: "Not specified",
      tips: "Try to be specific about what you want to achieve and by when."
    };
  }

  const prompt = `
    Create a SMART goal based on this input: "${userInput}".
    
    User context:
    - Past goals: ${userData?.pastGoals || 'Not available'}
    - Interests: ${userData?.interests || 'Not available'}
    
    Make sure the goal is:
    - Specific: Clear and well-defined
    - Measurable: Include metrics to track progress
    - Achievable: Realistic given user context
    - Relevant: Aligned with user's interests
    - Time-bound: Include a deadline or timeframe
    
    Format the response as a structured goal with title and details.
  `;

  const mockResponse = {
    title: "Complete 30 minutes of exercise 3 times per week",
    description: "I will establish a regular fitness routine by exercising for at least 30 minutes, 3 times weekly, focusing on a mix of cardio and strength training to improve my overall health.",
    metrics: "Track workout duration and frequency per week",
    timeframe: "Start immediately and maintain for the next 3 months",
    tips: "Schedule specific days/times for workouts, find an accountability partner, track progress in a fitness app"
  };

  try {
    const result = await callOpenAI(prompt, JSON.stringify(mockResponse));
    
    // Try to parse the result as JSON
    if (typeof result === 'string' && result.startsWith('{')) {
      try {
        return JSON.parse(result);
      } catch (parseError) {
        console.error('Error parsing JSON response:', parseError);
        return mockResponse;
      }
    }
    return result;
  } catch (e) {
    console.error('Error in createSmartGoal:', e);
    return mockResponse;
  }
}

/**
 * Automated Goal Breakdown - Creates step-by-step action plans
 */
async function createActionPlan(goalDetails) {
  const prompt = `
    Create a detailed action plan for this goal: "${goalDetails.title}".
    
    Goal description: ${goalDetails.description}
    Timeframe: ${goalDetails.timeframe || 'Not specified'}
    
    Please break this down into:
    1. 3-7 actionable steps
    2. Resources needed for each step
    3. Potential obstacles and solutions
    4. Initial milestone to build momentum
    
    Format as a JSON object with these sections.
  `;

  const mockResponse = {
    steps: [
      {
        name: "Schedule workout days",
        description: "Decide which 3 days of the week you'll exercise and block time in your calendar",
        timeEstimate: "30 minutes, one-time setup"
      },
      {
        name: "Prepare workout environment",
        description: "Set up home exercise space or get gym membership",
        timeEstimate: "1-2 hours, one-time setup"
      },
      {
        name: "Plan workout routines",
        description: "Find 3-5 workout routines to rotate through",
        timeEstimate: "1 hour, update monthly"
      },
      {
        name: "Track progress",
        description: "Set up tracking method (app, journal, etc.) to record workouts",
        timeEstimate: "15 minutes setup, 5 minutes after each workout"
      }
    ],
    resources: [
      "Workout clothes and shoes",
      "Fitness app or journal",
      "Basic equipment or gym membership",
      "Water bottle and towel"
    ],
    obstacles: [
      {
        obstacle: "Lack of motivation",
        solution: "Find workout buddy or join a class for accountability"
      },
      {
        obstacle: "Time constraints",
        solution: "Schedule workouts like important meetings, consider shorter high-intensity sessions if needed"
      },
      {
        obstacle: "Physical limitations",
        solution: "Start with lower intensity and gradually increase, consult with professional if needed"
      }
    ],
    firstMilestone: "Complete all 3 planned workouts in the first week"
  };

  const result = await callOpenAI(prompt, JSON.stringify(mockResponse));
  
  try {
    return typeof result === 'string' && result.startsWith('{') ? JSON.parse(result) : result;
  } catch (e) {
    return result;
  }
}

/**
 * Motivational Nudges - Personalized coaching messages
 */
async function generateMotivationalNudge(userData, goalProgress) {
  const prompt = `
    Create a personalized motivational message for a user working on their goals.
    
    User context:
    - Current goal: ${userData?.currentGoal || 'Not available'}
    - Progress: ${goalProgress?.percentage || '0'}% complete
    - Recent activity: ${goalProgress?.recentActivity || 'None recorded'}
    - Common obstacles: ${userData?.commonObstacles || 'Not available'}
    
    If they're doing well (>70% progress), give positive reinforcement.
    If they're struggling (<30% progress), provide encouragement and specific tips.
    If they're in the middle, provide balanced motivation and practical next steps.
    
    Keep it concise, personal, and actionable.
  `;

  const mockResponse = {
    message: "You're making steady progress on your exercise goal! I've noticed you've completed 2 of your 3 planned workouts this week. Remember why you started - how great you feel after each session. For your next workout, try the new routine you saved or invite a friend to join you for extra motivation!",
    type: "encouragement",
    suggestedAction: "Schedule your third workout for this week now to maintain your momentum."
  };

  const result = await callOpenAI(prompt, JSON.stringify(mockResponse));
  
  try {
    return typeof result === 'string' && result.startsWith('{') ? JSON.parse(result) : result;
  } catch (e) {
    return result;
  }
}

/**
 * Goal Completion Forecasting - Predicts success likelihood
 */
async function forecastGoalCompletion(goalDetails, progressData) {
  const prompt = `
    Analyze this goal and progress data to forecast completion likelihood:
    
    Goal: ${goalDetails.title}
    Description: ${goalDetails.description}
    Timeframe: ${goalDetails.timeframe || 'Not specified'}
    
    Progress data:
    - Days active: ${progressData?.daysActive || 0}
    - Completion percentage: ${progressData?.percentComplete || 0}%
    - Consistency score: ${progressData?.consistencyScore || 'Not available'}
    - Similar past goals: ${progressData?.similarPastGoals || 'None'}
    
    Please provide:
    1. Overall completion likelihood (percentage)
    2. Key factors affecting this forecast
    3. Recommendations to improve likelihood
    4. Estimated completion date
    
    Format response as JSON.
  `;

  const mockResponse = {
    completionLikelihood: 75,
    keyFactors: [
      "Strong start with 80% adherence in first two weeks",
      "Similar pattern to previously completed fitness goal",
      "Current pace slightly behind ideal timeline",
      "Consistent workout tracking indicates commitment"
    ],
    recommendations: [
      "Add calendar reminders for scheduled workout days",
      "Increase accountability by sharing goal with friend",
      "Prepare for week 3-4 motivation dip with a new workout or reward",
      "Address time constraint pattern by preparing shorter backup workouts"
    ],
    estimatedCompletionDate: "March 15, 2023",
    confidenceInterval: "±7 days"
  };

  const result = await callOpenAI(prompt, JSON.stringify(mockResponse));
  
  try {
    return typeof result === 'string' && result.startsWith('{') ? JSON.parse(result) : result;
  } catch (e) {
    return result;
  }
}

/**
 * Progress Insights & Reports - Analytics on goal progress
 */
async function generateProgressInsights(goalDetails, progressData) {
  const prompt = `
    Generate insights and analytics for this goal's progress:
    
    Goal: ${goalDetails.title}
    Description: ${goalDetails.description}
    
    Progress data:
    - Timeline: Started ${progressData?.startDate || 'recently'}, ${progressData?.daysActive || 0} days active
    - Current progress: ${progressData?.percentComplete || 0}%
    - Activity pattern: ${progressData?.activityPattern || 'Irregular'}
    - Challenges noted: ${progressData?.challengesNoted || 'None recorded'}
    
    Please provide:
    1. Key performance indicators and trends
    2. Pattern analysis (time of day, day of week, etc.)
    3. Comparative analysis to similar goals or benchmarks
    4. Actionable insights to improve performance
    
    Format as a structured report with sections.
  `;

  const mockResponse = {
    summary: "You're making good progress on your exercise goal with 65% completion after 21 days.",
    keyMetrics: {
      completionRate: "65%",
      averageSessionsPerWeek: 2.3,
      consistencyScore: "Medium-High",
      mostActiveDay: "Tuesday",
      leastActiveDay: "Friday"
    },
    patterns: [
      "Morning workouts (6-8am) have 90% completion rate vs. evening workouts (40%)",
      "Weekend workouts are shorter but more consistent than weekday sessions",
      "Weather correlation detected: 30% drop in activity on rainy days"
    ],
    comparativeInsights: "Your current goal progress is 15% above your previous fitness goal and 10% above average for similar users.",
    actionableInsights: [
      "Schedule more morning workouts for better completion rates",
      "Prepare indoor alternatives for forecasted rainy days",
      "Your Tuesday momentum can be leveraged for harder workout types",
      "Consider adding a Friday accountability mechanism to address the weak point in your week"
    ]
  };

  const result = await callOpenAI(prompt, JSON.stringify(mockResponse));
  
  try {
    return typeof result === 'string' && result.startsWith('{') ? JSON.parse(result) : result;
  } catch (e) {
    return result;
  }
}

/**
 * Natural Language Logging - Conversational progress updates
 */
async function processNaturalLanguageUpdate(userInput, goalDetails) {
  const prompt = `
    Parse this natural language update from a user about their goal progress:
    
    User update: "${userInput}"
    
    Current goal: ${goalDetails.title}
    Description: ${goalDetails.description}
    
    Extract and structure the following information:
    1. Progress made (specific accomplishments)
    2. Time/date information
    3. Challenges encountered
    4. Emotional state/sentiment
    5. Questions or needs
    
    If any information is missing, indicate that it's not provided.
    Format response as a structured JSON object.
  `;

  const mockResponse = {
    progressMade: "Completed two 30-minute workout sessions",
    timeInformation: "This week, specifically Tuesday and Thursday mornings",
    challenges: "Had trouble with motivation on Thursday, almost skipped the workout",
    sentiment: "Generally positive with some struggle",
    questions: "Looking for advice on weekend workout routines",
    structuredProgress: {
      workoutCount: 2,
      totalMinutes: 60,
      weeklyTarget: "3 sessions per week",
      completionPercentage: 67
    }
  };

  const result = await callOpenAI(prompt, JSON.stringify(mockResponse));
  
  try {
    return typeof result === 'string' && result.startsWith('{') ? JSON.parse(result) : result;
  } catch (e) {
    return result;
  }
}

/**
 * Generates milestone suggestions for a goal - direct ChatGPT integration
 */
async function generateMilestones(title, description, startDate, targetDate, category, subscriptionPlan) {
  // Simple prompt to pass user's goal directly to ChatGPT
  const prompt = `Create a detailed plan with milestones for: ${title} ${description ? '- ' + description : ''}
  
  The user wants to start working on this goal from ${startDate} and accomplish it by ${targetDate}.
  
  Please provide a complete breakdown of exactly what steps they should take to achieve this goal, with specific milestones distributed evenly between the start date (${startDate}) and target date (${targetDate}).
  
  Format your response as a JSON array of milestone objects with these properties:
  - title: The milestone name
  - description: Detailed instructions for this milestone
  - targetDate: When this milestone should be completed by (in YYYY-MM-DD format, between ${startDate} and ${targetDate})
  - metrics: An array of metrics to track (each with name, target, and unit properties)
  
  IMPORTANT: 
  - Your response must be valid JSON only. Do not include markdown formatting or code blocks.
  - Distribute milestone dates evenly between ${startDate} and ${targetDate}
  - Create 3-6 milestones depending on the timeframe
  
  Be specific to the exact goal mentioned. For example, if they want to learn guitar, include actual guitar techniques, practice routines, etc.`;

  // Default milestones in case of error - now properly using start and end dates
  const startDateObj = new Date(startDate);
  const targetDateObj = new Date(targetDate);
  
  const defaultMilestones = [
    {
      title: "Get Started",
      description: `Start your journey to ${title}`,
      targetDate: getDateBetween(startDateObj, targetDateObj, 0.2),
      metrics: [{ name: "Progress", target: 1, unit: "completion" }]
    },
    {
      title: "Make Progress",
      description: `Continue working on ${title}`,
      targetDate: getDateBetween(startDateObj, targetDateObj, 0.5),
      metrics: [{ name: "Progress", target: 50, unit: "percent" }]
    },
    {
      title: "Reach Your Goal",
      description: `Complete your goal of ${title}`,
      targetDate: targetDate,
      metrics: [{ name: "Progress", target: 100, unit: "percent" }]
    }
  ];

  // If OpenAI API is available, call it directly
  if (openai && process.env.OPENAI_API_KEY) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a goal planning assistant. Your response must be valid JSON only - no markdown, no code blocks, just pure JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      });
      
      let result = response.choices[0].message.content.trim();
      
      // Remove any markdown code blocks if present
      if (result.includes("```")) {
        result = result.replace(/```json\n/g, '').replace(/```\n/g, '').replace(/```/g, '');
      }
      
      try {
        // Try to parse JSON
        const parsedResult = JSON.parse(result);
        
        // Validate the result is an array of milestone objects
        if (Array.isArray(parsedResult) && parsedResult.length > 0) {
          console.log(`Successfully generated ${parsedResult.length} milestones for: ${title}`);
          return parsedResult;
        } else {
          console.error("API returned invalid milestone format");
          return defaultMilestones;
        }
      } catch (parseError) {
        console.error("Error parsing API response:", parseError);
        return defaultMilestones;
      }
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      return defaultMilestones;
    }
  } else {
    console.log("No OpenAI API key configured, using default milestones");
    return defaultMilestones;
  }
}

// Helper function to calculate a date between two dates
function getDateBetween(startDate, endDate, percentage) {
  const start = startDate.getTime();
  const end = endDate.getTime();
  const date = new Date(start + (end - start) * percentage);
  return date.toISOString().split('T')[0];
}

/**
 * Generate Weekly Targets - AI-driven weekly targets based on goal progress
 */
async function generateWeeklyTargets(goalDetails, progressData) {
  const prompt = `
    Generate personalized weekly targets for a user working on this goal:
    
    Goal: ${goalDetails.title}
    Description: ${goalDetails.description}
    Timeframe: ${goalDetails.timeframe || 'Not specified'}
    
    Progress data:
    - Days active: ${progressData?.daysActive || 0}
    - Completion percentage: ${progressData?.percentComplete || 0}%
    - Recent activity: ${progressData?.recentActivity || 'None recorded'}
    
    Please create 3-4 specific, actionable weekly targets that:
    1. Are appropriate for their current progress level
    2. Adapt based on their recent activity patterns
    3. Are achievable within one week
    4. Build toward their larger goal
    
    Format the response as a JSON array of target objects with id, title, due date, and completed status.
  `;

  const mockResponse = [
    {
      id: "wt1",
      title: "Complete Section 2 of JavaScript fundamentals",
      due: "Today",
      completed: false
    },
    {
      id: "wt2",
      title: "Practice array methods for 30 minutes",
      due: "Tomorrow",
      completed: false
    },
    {
      id: "wt3",
      title: "Complete 3 coding exercises on functions",
      due: "Wednesday",
      completed: false
    },
    {
      id: "wt4",
      title: "Review week's materials and take practice quiz",
      due: "Friday",
      completed: false
    }
  ];

  const result = await callOpenAI(prompt, JSON.stringify(mockResponse));
  
  try {
    return typeof result === 'string' && result.startsWith('[') ? JSON.parse(result) : result;
  } catch (e) {
    return mockResponse;
  }
}

/**
 * Generate Key Insight - Creates a personalized insight for the dashboard
 */
async function generateKeyInsight(goalDetails, progressData) {
  const prompt = `
    Generate a personalized, AI-driven insight about this user's goal progress:
    
    Goal: ${goalDetails.title}
    Description: ${goalDetails.description}
    
    Progress data:
    - Days active: ${progressData?.daysActive || 0}
    - Completion percentage: ${progressData?.percentComplete || 0}%
    - Activity pattern: ${progressData?.activityPattern || 'Irregular'}
    
    Create a single, helpful insight that:
    1. Identifies a pattern in their behavior (e.g., most productive days, consistency issues)
    2. Offers a specific, actionable suggestion
    3. Is personalized to their specific goal
    4. Is conversational and motivating
    
    Keep it concise (under 100 words) and make it feel like a personal coach observation.
  `;

  const mockResponse = "Your most consistent days are Tuesday and Thursday. I notice your progress dropped last Thursday—want to adjust your plan to include more flexibility on Thursdays? Consider setting smaller milestone targets for that day.";

  const result = await callOpenAI(prompt, mockResponse);
  return result;
}

module.exports = {
  processChatMessage,
  createSmartGoal,
  createActionPlan,
  generateMotivationalNudge,
  forecastGoalCompletion,
  generateProgressInsights,
  processNaturalLanguageUpdate,
  generateMilestones,
  generateWeeklyTargets,
  generateKeyInsight
};
