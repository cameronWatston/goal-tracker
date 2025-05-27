const db = require('./init');

// Tutorial content for different pages
const tutorials = [
    // Home Page Tutorials
    {
        key_name: 'home_welcome',
        title: 'Welcome to Goal Tracker! 🎯',
        description: 'Welcome! Let\'s take a quick tour to help you get started with achieving your goals.',
        page_path: '/',
        element_selector: 'body',
        position: 'center',
        order_index: 1,
        is_required: true
    },
    {
        key_name: 'home_features',
        title: 'Powerful Features',
        description: 'Explore our features including AI milestone generation, progress tracking, and achievement badges.',
        page_path: '/',
        element_selector: '#features',
        position: 'top',
        order_index: 2,
        is_required: true
    },
    {
        key_name: 'home_get_started',
        title: 'Ready to Start?',
        description: 'Click "Get Started" to create your free account and begin your journey to success!',
        page_path: '/',
        element_selector: '.register-btn',
        position: 'bottom',
        order_index: 3,
        is_required: true
    },

    // Dashboard Tutorials
    {
        key_name: 'dashboard_welcome',
        title: 'Your Goal Dashboard 📊',
        description: 'This is your central hub where you can see all your goals and track your progress.',
        page_path: '/dashboard',
        element_selector: '.dashboard-header',
        position: 'bottom',
        order_index: 1,
        is_required: true
    },
    {
        key_name: 'dashboard_create_goal',
        title: 'Create Your First Goal',
        description: 'Click this button to create a new goal. Our AI will help you break it down into achievable milestones!',
        page_path: '/dashboard',
        element_selector: '.create-goal-btn',
        position: 'right',
        order_index: 2,
        is_required: true
    },
    {
        key_name: 'dashboard_goal_cards',
        title: 'Your Goals',
        description: 'Each card represents a goal. You can see progress, deadlines, and quick actions for each goal.',
        page_path: '/dashboard',
        element_selector: '.goal-card:first-child',
        position: 'bottom',
        order_index: 3,
        is_required: false
    },
    {
        key_name: 'dashboard_filters',
        title: 'Filter & Sort',
        description: 'Use these options to organize your goals by status, date, or progress.',
        page_path: '/dashboard',
        element_selector: '.filter-section',
        position: 'bottom',
        order_index: 4,
        is_required: false
    },

    // Goal Detail Page Tutorials
    {
        key_name: 'goal_detail_overview',
        title: 'Goal Overview',
        description: 'Here you can see all details about your goal including category, deadline, and progress statistics.',
        page_path: '/goals/detail',
        element_selector: '.goal-header-card',
        position: 'bottom',
        order_index: 1,
        is_required: true
    },
    {
        key_name: 'goal_detail_progress',
        title: 'Progress Visualization',
        description: 'Track your progress visually with charts, timelines, and achievement badges.',
        page_path: '/goals/detail',
        element_selector: '[data-tutorial="progress-visualization"]',
        position: 'top',
        order_index: 2,
        is_required: true
    },
    {
        key_name: 'goal_detail_milestones',
        title: 'Interactive Milestones',
        description: 'Break down your goal into milestones. Use the progress slider to update how far you\'ve come!',
        page_path: '/goals/detail',
        element_selector: '[data-tutorial="milestones"]',
        position: 'top',
        order_index: 3,
        is_required: true
    },
    {
        key_name: 'goal_detail_milestone_progress',
        title: 'Update Progress',
        description: 'Simply drag this slider to update your progress. The status will automatically change as you progress!',
        page_path: '/goals/detail',
        element_selector: '.milestone-progress:first',
        position: 'right',
        order_index: 4,
        is_required: true
    },
    {
        key_name: 'goal_detail_quick_actions',
        title: 'Quick Actions',
        description: 'Add check-ins to track your journey, write notes, or get AI-powered motivation when you need it.',
        page_path: '/goals/detail',
        element_selector: '[data-tutorial="quick-actions"]',
        position: 'left',
        order_index: 5,
        is_required: false
    }
];

// Function to seed tutorials
function seedTutorials() {
    console.log('🌱 Seeding tutorial content...');
    
    // Clear existing tutorials
    db.run('DELETE FROM tutorials', (err) => {
        if (err) {
            console.error('Error clearing tutorials:', err);
            return;
        }
        
        console.log('✅ Cleared existing tutorials');
        
        // Insert new tutorials
        const insertStmt = db.prepare(`
            INSERT INTO tutorials (
                key_name, title, description, page_path, 
                element_selector, position, order_index, is_required
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        let insertedCount = 0;
        
        tutorials.forEach((tutorial) => {
            insertStmt.run([
                tutorial.key_name,
                tutorial.title,
                tutorial.description,
                tutorial.page_path,
                tutorial.element_selector,
                tutorial.position,
                tutorial.order_index,
                tutorial.is_required ? 1 : 0
            ], function(err) {
                if (err) {
                    console.error('Error inserting tutorial:', tutorial.key_name, err);
                } else {
                    insertedCount++;
                    console.log(`✅ Inserted tutorial: ${tutorial.key_name}`);
                    
                    if (insertedCount === tutorials.length) {
                        console.log(`🎉 Successfully seeded ${insertedCount} tutorials!`);
                        insertStmt.finalize();
                    }
                }
            });
        });
    });
}

// Run seeding if this file is executed directly
if (require.main === module) {
    seedTutorials();
}

module.exports = { seedTutorials }; 