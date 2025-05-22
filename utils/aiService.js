const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Initialize variables
let openai = null;
let openaiInitialized = false;

// Safely initialize OpenAI
function initializeOpenAI() {
    try {
        // Make sure environment variables are loaded
        dotenv.config();
        
        // Get API key from environment
        const apiKey = process.env.OPENAI_API_KEY;
        
        // Check if API key exists and is valid - support both sk- and sk-proj- formats
        if (apiKey && (apiKey.startsWith('sk-') || apiKey.startsWith('sk-proj-'))) {
            try {
                openai = new OpenAI({ apiKey });
                openaiInitialized = true;
                console.log('✅ OpenAI API initialized successfully');
                return true;
            } catch (initError) {
                console.error('❌ Error creating OpenAI client:', initError.message);
            }
        } else {
            console.warn('⚠️ Invalid or missing OpenAI API key format');
        }
    } catch (error) {
        console.error('❌ Failed to initialize OpenAI API:', error.message);
    }
    
    return false;
}

// Try to initialize OpenAI at startup
initializeOpenAI();

/**
 * Generate milestones for a specific goal using OpenAI
 * @param {string} goalTitle - The title of the goal
 * @param {string} goalDescription - The description of the goal
 * @param {Date} targetDate - The target completion date
 * @param {string} category - The category of the goal
 * @param {string} subscriptionPlan - The user's subscription plan ('free', 'monthly', 'annual')
 * @returns {Array} - Array of milestone objects
 */
const generateMilestones = async (goalTitle, goalDescription, targetDate, category, subscriptionPlan = 'free') => {
    try {
        // Calculate days remaining until target date
        const today = new Date();
        const target = new Date(targetDate);
        const daysRemaining = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
        
        if (daysRemaining <= 0) {
            throw new Error('Target date must be in the future');
        }

        // Check if user has premium subscription
        const isPremium = subscriptionPlan === 'monthly' || subscriptionPlan === 'annual';
        
        // For free users, use basic milestone generation regardless of OpenAI availability
        if (!isPremium) {
            console.log('User on free plan - generating basic milestones');
            return generateBasicMilestones(goalTitle, daysRemaining, target, category);
        }

        // For premium users, try to use OpenAI if available
        if (!openaiInitialized) {
            // Try to initialize again in case it failed on startup
            initializeOpenAI();
        }
        
        // Check if OpenAI is available for premium users
        if (!openai || !openaiInitialized) {
            console.log('OpenAI unavailable for premium user - falling back to enhanced milestones');
            return generateEnhancedMilestones(goalTitle, goalDescription, daysRemaining, target, category);
        }

        console.log(`Generating premium AI milestones for ${subscriptionPlan} user`);
        
        // Premium users get full AI-generated milestones
        // Create prompt for the AI
        const prompt = `
        Create a detailed milestone plan for the following goal:
        
        Goal: ${goalTitle}
        Description: ${goalDescription}
        Category: ${category}
        Timeframe: ${daysRemaining} days (from today until ${target.toDateString()})
        
        Please create a series of 4-6 specific, actionable milestones that will help achieve this goal by the target date.
        
        For each milestone, include:
        1. A specific title
        2. A brief description of what needs to be done
        3. A reasonable target date within the timeframe
        4. Key performance indicators (metrics) to measure success
        
        Format the response as a JSON array where each milestone is an object with properties: 
        title, description, targetDate (in YYYY-MM-DD format), and metrics.
        
        Make the milestones realistic, measurable, and properly spaced throughout the available time period to ensure steady progress.
        `;

        try {
            // Call OpenAI API
            const response = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: "You are a goal achievement expert. You specialize in breaking down complex goals into actionable milestones with realistic timeframes." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
                max_tokens: 1500,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            });

            // Parse the AI response to extract JSON
            const aiResponse = response.choices[0].message.content;
            const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
            
            if (jsonMatch) {
                console.log('Successfully generated AI milestones for premium user');
                const milestonesJson = jsonMatch[0];
                return JSON.parse(milestonesJson);
            } else {
                console.error('Could not extract JSON from AI response:', aiResponse);
                // Fallback to enhanced milestones for premium users
                return generateEnhancedMilestones(goalTitle, goalDescription, daysRemaining, target, category);
            }
        } catch (openaiError) {
            console.error('Error calling OpenAI API:', openaiError);
            // Fallback to enhanced milestones for premium users
            return generateEnhancedMilestones(goalTitle, goalDescription, daysRemaining, target, category);
        }
    } catch (error) {
        console.error('Error generating milestones:', error);
        // If API call fails, generate a simple set of milestones
        return generateFallbackMilestones(goalTitle, daysRemaining, target);
    }
};

/**
 * Generate basic milestones for free users
 */
const generateBasicMilestones = (goalTitle, daysRemaining, targetDate, category) => {
    const milestones = [];
    
    // Only 3 basic milestones for free users
    const intervalDays = Math.max(Math.floor(daysRemaining / 3), 1);
    
    const categoryTitles = {
        'health': ['Start Exercising', 'Consistency Check', 'Final Assessment'],
        'career': ['Research Phase', 'Implementation', 'Completion'],
        'personal': ['Getting Started', 'Progress Check', 'Final Achievement'],
        'finance': ['Budget Planning', 'Saving Progress', 'Financial Goal Completion'],
        'relationships': ['Initial Connection', 'Developing Bonds', 'Relationship Achievement'],
        'other': ['Beginning Phase', 'Middle Checkpoint', 'Final Goal Check']
    };
    
    const titles = categoryTitles[category] || ['Starting Point', 'Halfway Mark', 'Final Stretch'];
    
    for (let i = 1; i <= 3; i++) {
        const milestoneDate = new Date();
        milestoneDate.setDate(milestoneDate.getDate() + (intervalDays * i));
        
        if (milestoneDate > targetDate) {
            milestoneDate.setTime(targetDate.getTime());
        }
        
        milestones.push({
            title: titles[i-1],
            description: `Basic milestone ${i}/3 for your goal: ${goalTitle}. Upgrade to premium for AI-optimized milestones.`,
            targetDate: milestoneDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
            metrics: [`${i * 33}% completion`]
        });
    }
    
    return milestones;
};

/**
 * Generate enhanced milestones for premium users when OpenAI is unavailable
 */
const generateEnhancedMilestones = (goalTitle, goalDescription, daysRemaining, targetDate, category) => {
    const milestones = [];
    
    // Generate 5 milestones for premium users
    const intervalDays = Math.max(Math.floor(daysRemaining / 5), 1);
    
    const categoryMilestones = {
        'health': [
            { title: 'Initial Assessment', description: 'Establish your baseline metrics and set specific targets' },
            { title: 'Create Routine', description: 'Design and implement your regular fitness/health routine' },
            { title: 'First Progress Check', description: 'Measure improvements and adjust your approach as needed' },
            { title: 'Consistency Challenge', description: 'Focus on maintaining your routine without interruption' },
            { title: 'Final Evaluation', description: 'Measure results against your initial targets and celebrate progress' }
        ],
        'career': [
            { title: 'Goal Research', description: 'Gather information and resources needed for your career objective' },
            { title: 'Skill Development Plan', description: 'Identify and start learning key skills required' },
            { title: 'Networking Milestone', description: 'Connect with professionals who can help advance your goal' },
            { title: 'Experience Building', description: 'Gain practical experience through projects or opportunities' },
            { title: 'Achievement Showcase', description: 'Document and present your growth and accomplishments' }
        ],
        'personal': [
            { title: 'Self-Assessment', description: 'Reflect on your current state and define what success looks like' },
            { title: 'Learning Phase', description: 'Acquire knowledge or skills needed for your personal development' },
            { title: 'Practice Implementation', description: 'Apply what you\'ve learned to real situations' },
            { title: 'Habit Formation', description: 'Turn your new behaviors into consistent habits' },
            { title: 'Reflection & Integration', description: 'Evaluate your growth and integrate changes into your life' }
        ],
        'finance': [
            { title: 'Financial Audit', description: 'Review your current financial situation in detail' },
            { title: 'Budget Creation', description: 'Develop a comprehensive budget aligned with your goal' },
            { title: 'Saving/Investing Strategy', description: 'Implement your plan for saving or investing' },
            { title: 'Midway Financial Review', description: 'Assess progress and make adjustments to your approach' },
            { title: 'Goal Completion & Future Planning', description: 'Celebrate reaching your financial goal and plan next steps' }
        ],
        'relationships': [
            { title: 'Connection Initiation', description: 'Make first meaningful contact or improvement effort' },
            { title: 'Understanding Development', description: 'Deepen your understanding of the relationship dynamics' },
            { title: 'Communication Enhancement', description: 'Improve how you communicate and listen' },
            { title: 'Shared Experiences', description: 'Create meaningful moments that strengthen your bond' },
            { title: 'Relationship Milestone', description: 'Reach a significant point of growth in the relationship' }
        ],
        'other': [
            { title: 'Goal Clarification', description: 'Define exactly what you want to achieve and why it matters' },
            { title: 'Resource Gathering', description: 'Collect all the resources, tools and support you need' },
            { title: 'Initial Progress', description: 'Make your first significant steps toward your goal' },
            { title: 'Obstacle Navigation', description: 'Successfully overcome challenges that arise' },
            { title: 'Final Achievement', description: 'Complete all requirements to reach your goal' }
        ]
    };
    
    // Select the appropriate milestone templates
    const templates = categoryMilestones[category] || categoryMilestones['other'];
    
    // Create milestone dates spread evenly through the available time
    for (let i = 0; i < 5; i++) {
        const milestoneDate = new Date();
        milestoneDate.setDate(milestoneDate.getDate() + (intervalDays * (i + 1)));
        
        if (milestoneDate > targetDate) {
            milestoneDate.setTime(targetDate.getTime() - (24 * 60 * 60 * 1000)); // One day before target
        }
        
        const template = templates[i];
        
        milestones.push({
            title: template.title,
            description: template.description + ' for your goal: ' + goalTitle,
            targetDate: milestoneDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
            metrics: [`${(i + 1) * 20}% towards completion`]
        });
    }
    
    return milestones;
};

/**
 * Generate fallback milestones if the AI fails
 */
const generateFallbackMilestones = (goalTitle, daysRemaining, targetDate) => {
    const milestones = [];
    
    // Calculate milestone intervals
    const intervalDays = Math.max(Math.floor(daysRemaining / 4), 1);
    
    for (let i = 1; i <= 4; i++) {
        const milestoneDate = new Date();
        milestoneDate.setDate(milestoneDate.getDate() + (intervalDays * i));
        
        if (milestoneDate > targetDate) {
            milestoneDate.setTime(targetDate.getTime());
        }
        
        milestones.push({
            title: `Milestone ${i} for ${goalTitle}`,
            description: `Progress checkpoint ${i * 25}% towards your goal`,
            targetDate: milestoneDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
            metrics: [`${i * 25}% completion`]
        });
    }
    
    return milestones;
};

module.exports = {
    generateMilestones,
    generateBasicMilestones,
    generateEnhancedMilestones
}; 