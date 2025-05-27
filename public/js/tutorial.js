// Tutorial content for different pages
const tutorialContent = {
    // Home Page Tutorial (for new users)
    'home': [
        {
            key: 'welcome',
            title: 'Welcome to Goal Tracker! 🎯',
            text: 'Welcome! Let\'s take a quick tour to help you get started with achieving your goals. This will only take a minute!',
            target: 'body',
            position: 'center'
        },
        {
            key: 'what_we_do',
            title: 'Transform Your Dreams into Reality',
            text: 'Goal Tracker helps you set, track, and achieve your goals with AI-powered insights and milestone tracking.',
            target: '.hero-section',
            position: 'bottom'
        },
        {
            key: 'features',
            title: 'Powerful Features',
            text: 'Explore our features including AI milestone generation, progress tracking, achievement badges, and community support.',
            target: '#features',
            position: 'top'
        },
        {
            key: 'get_started',
            title: 'Ready to Start?',
            text: 'Click "Get Started" to create your free account and begin your journey to success!',
            target: '.register-btn',
            position: 'bottom'
        }
    ],
    
    // Dashboard Tutorial (for new users)
    'dashboard': [
        {
            key: 'welcome_dashboard',
            title: 'Welcome to Your Dashboard! 📊',
            text: 'This is your central hub where you can see all your goals and track your progress. Let me show you around!',
            target: '.dashboard-header',
            position: 'bottom'
        },
        {
            key: 'create_first_goal',
            title: 'Create Your First Goal',
            text: 'Click this button to create a new goal. Our AI will help you break it down into achievable milestones!',
            target: '.create-goal-btn',
            position: 'right'
        },
        {
            key: 'goal_cards',
            title: 'Your Goals',
            text: 'Each card represents a goal. You can see progress, deadlines, and quick actions for each goal.',
            target: '[data-tutorial="goal-cards"]:first',
            position: 'bottom'
        },
        {
            key: 'filters',
            title: 'Filter & Sort',
            text: 'Use these options to organize your goals by status, date, or progress.',
            target: '.filter-section',
            position: 'bottom'
        },
        {
            key: 'ai_insights',
            title: 'AI Insights',
            text: 'Get personalized insights and recommendations based on your progress patterns.',
            target: '#ai-dashboard-assistant, #ai-dashboard-assistant-premium',
            position: 'top'
        }
    ],
    
    // Goal Detail Tutorial (for new users)
    'goal-detail': [
        {
            key: 'goal_overview',
            title: 'Goal Overview',
            text: 'Here you can see all details about your goal including category, deadline, and progress statistics.',
            target: '.goal-header-card',
            position: 'bottom'
        },
        {
            key: 'progress_visualization',
            title: 'Progress Visualization',
            text: 'Track your progress visually with charts, timelines, and achievement badges.',
            target: '[data-tutorial="progress-visualization"]',
            position: 'top'
        },
        {
            key: 'milestones',
            title: 'Interactive Milestones',
            text: 'Break down your goal into milestones. Use the progress slider to update how far you\'ve come!',
            target: '[data-tutorial="milestones"]',
            position: 'top'
        },
        {
            key: 'milestone_progress',
            title: 'Update Progress',
            text: 'Simply drag this slider to update your progress. The status will automatically change as you progress!',
            target: '.milestone-progress:first',
            position: 'right'
        },
        {
            key: 'quick_actions',
            title: 'Quick Actions',
            text: 'Add check-ins to track your journey, write notes, or get AI-powered motivation when you need it.',
            target: '[data-tutorial="quick-actions"]',
            position: 'left'
        }
    ],
    
    // Community Tutorial (for new users)
    'community': [
        {
            key: 'community_welcome',
            title: 'Welcome to the Community! 👥',
            text: 'Connect with fellow goal achievers, share your progress, and find motivation together!',
            target: '.community-header',
            position: 'bottom'
        },
        {
            key: 'find_people',
            title: 'Find People',
            text: 'Search for other users and send friend requests to build your support network.',
            target: 'button[data-bs-target="#searchUsersModal"]',
            position: 'bottom'
        },
        {
            key: 'messaging',
            title: 'Private Messaging',
            text: 'Send private messages to your friends for support, motivation, and accountability.',
            target: 'button[data-bs-target="#messagesModal"]',
            position: 'bottom'
        },
        {
            key: 'community_tabs',
            title: 'Community Features',
            text: 'Explore different sections: Feed for updates, Friends list, Friend requests, and Discover new people.',
            target: '#communityTabs',
            position: 'bottom'
        }
    ],
    
    // Profile Page Tutorial
    'profile': [
        {
            key: 'profile_overview',
            title: 'Your Profile',
            text: 'Manage your account settings, view your statistics, and track your overall progress.',
            target: '.profile-header',
            position: 'bottom'
        },
        {
            key: 'stats',
            title: 'Your Statistics',
            text: 'See your achievement stats, completion rates, and streak information at a glance.',
            target: '.stats-section',
            position: 'right'
        },
        {
            key: 'subscription',
            title: 'Subscription Status',
            text: 'View your current plan and upgrade to unlock premium features like AI milestone generation.',
            target: '.subscription-section',
            position: 'left'
        },
        {
            key: 'settings',
            title: 'Account Settings',
            text: 'Update your profile information, change password, or manage notification preferences.',
            target: '.settings-section',
            position: 'top'
        }
    ]
};

// Tutorial state management
let currentTutorial = null;
let currentStep = 0;
let tutorialActive = false;

// Check if user is new and should see tutorial
function isNewUser() {
    // First check if tutorial was already completed - if so, user is not new
    const hasSeenTutorial = localStorage.getItem('tutorialCompleted');
    if (hasSeenTutorial === 'true') {
        return false;
    }
    
    // Check multiple indicators to determine if user is new
    const accountAge = getUserAccountAge();
    const hasGoals = checkIfUserHasGoals();
    const loginCount = getLoginCount();
    
    // User is considered new if:
    // 1. Account is less than 3 days old AND can determine age, OR
    // 2. Has never seen tutorial AND has no goals AND login count < 5
    return (
        (accountAge !== null && accountAge < 3) || 
        (!hasSeenTutorial && !hasGoals && loginCount < 5)
    );
}

function getUserAccountAge() {
    // Try to get user creation date from page data
    const userDataElement = document.getElementById('user-data');
    if (userDataElement) {
        try {
            const userData = JSON.parse(userDataElement.textContent);
            if (userData.created_at) {
                const createdDate = new Date(userData.created_at);
                const now = new Date();
                const diffTime = Math.abs(now - createdDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays;
            }
        } catch (e) {
            console.log('Could not parse user data for tutorial check');
        }
    }
    
    // Fallback: check localStorage for account creation tracking
    const accountCreated = localStorage.getItem('accountCreatedDate');
    if (accountCreated) {
        const createdDate = new Date(accountCreated);
        const now = new Date();
        const diffTime = Math.abs(now - createdDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }
    
    // If we can't determine age, return null
    return null;
}

function checkIfUserHasGoals() {
    // Check if there are goal cards on the page
    const goalCards = document.querySelectorAll('.goal-card, [data-goal-id]');
    return goalCards.length > 0;
}

function getLoginCount() {
    const loginCount = localStorage.getItem('loginCount');
    return loginCount ? parseInt(loginCount) : 0;
}

function incrementLoginCount() {
    const currentCount = getLoginCount();
    localStorage.setItem('loginCount', (currentCount + 1).toString());
}

// Auto-start tutorial for new users
function checkAutoStartTutorial(pageType = null) {
    // Don't show tutorial if one is already active
    if (tutorialActive) {
        console.log('📚 Tutorial already active - skipping');
        return;
    }
    
    // Don't show tutorial if user is not new
    if (!isNewUser()) {
        console.log('👤 Experienced user - skipping tutorial');
        return;
    }
    
    // Determine page type if not provided
    if (!pageType) {
        pageType = detectPageType();
    }
    
    // Check if tutorial was already shown for this page
    const tutorialKey = `tutorial_${pageType}_shown`;
    const tutorialShown = localStorage.getItem(tutorialKey);
    
    if (tutorialShown) {
        console.log(`📚 Tutorial already shown for ${pageType}`);
        return;
    }
    
    // Show tutorial after a short delay
    setTimeout(() => {
        if (shouldShowTutorialForPage(pageType) && !tutorialActive) {
            console.log(`🎓 Starting tutorial for new user on ${pageType} page`);
            startTutorial(pageType);
        }
    }, 2000);
}

function detectPageType() {
    const path = window.location.pathname;
    
    if (path === '/' || path === '/home') return 'home';
    if (path.includes('/dashboard') || path.includes('/goals/dashboard')) return 'dashboard';
    if (path.includes('/goals/detail')) return 'goal-detail';
    if (path.includes('/community')) return 'community';
    
    return 'general';
}

function shouldShowTutorialForPage(pageType) {
    // Only show tutorial for specific pages and new users
    const validPages = ['home', 'dashboard', 'goal-detail', 'community'];
    return validPages.includes(pageType) && tutorialContent[pageType];
}

// Start tutorial
function startTutorial(pageType = null) {
    if (!pageType) {
        pageType = detectPageType();
    }
    
    const tutorial = tutorialContent[pageType];
    if (!tutorial) {
        console.log(`No tutorial available for page type: ${pageType}`);
        return;
    }
    
    currentTutorial = tutorial;
    currentStep = 0;
    tutorialActive = true;
    
    showTutorialStep();
    createTutorialOverlay();
}

function showTutorialStep() {
    if (!currentTutorial || currentStep >= currentTutorial.length) {
        completeTutorial();
        return;
    }
    
    const step = currentTutorial[currentStep];
    
    // Update tutorial content
    updateTutorialContent(step);
    
    // Highlight target element
    highlightElement(step.target);
    
    // Position tutorial overlay
    positionTutorialOverlay(step);
}

function updateTutorialContent(step) {
    const overlay = document.getElementById('tutorialOverlay');
    if (!overlay) return;
    
    const title = overlay.querySelector('#tutorialTitle');
    const text = overlay.querySelector('#tutorialText');
    const currentStepSpan = overlay.querySelector('#currentStep');
    const totalStepsSpan = overlay.querySelector('#totalSteps');
    const prevBtn = overlay.querySelector('#tutorialPrev');
    const nextBtn = overlay.querySelector('#tutorialNext');
    
    if (title) title.textContent = step.title;
    if (text) text.textContent = step.text;
    if (currentStepSpan) currentStepSpan.textContent = currentStep + 1;
    if (totalStepsSpan) totalStepsSpan.textContent = currentTutorial.length;
    
    // Update button states
    if (prevBtn) {
        prevBtn.style.display = currentStep === 0 ? 'none' : 'inline-block';
    }
    
    if (nextBtn) {
        nextBtn.textContent = currentStep === currentTutorial.length - 1 ? 'Finish' : 'Next';
    }
}

function createTutorialOverlay() {
    // Remove existing overlay
    const existingOverlay = document.getElementById('tutorialOverlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }
    
    // Create new overlay
    const overlay = document.createElement('div');
    overlay.id = 'tutorialOverlay';
    overlay.className = 'tutorial-overlay';
    overlay.innerHTML = `
        <div class="tutorial-backdrop"></div>
        <div class="tutorial-content">
            <div class="tutorial-header">
                <h4 id="tutorialTitle"></h4>
                <button type="button" class="btn-close tutorial-close" onclick="skipTutorial()"></button>
            </div>
            <div class="tutorial-body">
                <p id="tutorialText"></p>
            </div>
            <div class="tutorial-footer">
                <button class="btn btn-outline-secondary" onclick="skipTutorial()">Skip Tutorial</button>
                <div class="tutorial-navigation">
                    <button class="btn btn-secondary" id="tutorialPrev" onclick="previousTutorialStep()">Previous</button>
                    <span class="tutorial-step-indicator">
                        <span id="currentStep">1</span> of <span id="totalSteps">1</span>
                    </span>
                    <button class="btn btn-primary" id="tutorialNext" onclick="nextTutorialStep()">Next</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add event listeners
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay || e.target.classList.contains('tutorial-backdrop')) {
            // Don't close on backdrop click for new users
            if (!isNewUser()) {
                skipTutorial();
            }
        }
    });
}

function highlightElement(selector) {
    // Remove previous highlights
    document.querySelectorAll('.tutorial-highlight').forEach(el => {
        el.classList.remove('tutorial-highlight');
    });
    
    // Add highlight to target element
    const targetElement = document.querySelector(selector);
    if (targetElement) {
        targetElement.classList.add('tutorial-highlight');
        targetElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'center'
        });
    }
}

function positionTutorialOverlay(step) {
    const overlay = document.getElementById('tutorialOverlay');
    const content = overlay.querySelector('.tutorial-content');
    
    if (!content) return;
    
    // Reset positioning
    content.style.position = 'fixed';
    content.style.top = '50%';
    content.style.left = '50%';
    content.style.transform = 'translate(-50%, -50%)';
    
    // Try to position relative to target element
    const targetElement = document.querySelector(step.target);
    if (targetElement && step.position !== 'center') {
        const rect = targetElement.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        
        switch (step.position) {
            case 'top':
                content.style.top = `${rect.top - contentRect.height - 20}px`;
                content.style.left = `${rect.left + (rect.width / 2)}px`;
                content.style.transform = 'translateX(-50%)';
                break;
            case 'bottom':
                content.style.top = `${rect.bottom + 20}px`;
                content.style.left = `${rect.left + (rect.width / 2)}px`;
                content.style.transform = 'translateX(-50%)';
                break;
            case 'left':
                content.style.top = `${rect.top + (rect.height / 2)}px`;
                content.style.left = `${rect.left - contentRect.width - 20}px`;
                content.style.transform = 'translateY(-50%)';
                break;
            case 'right':
                content.style.top = `${rect.top + (rect.height / 2)}px`;
                content.style.left = `${rect.right + 20}px`;
                content.style.transform = 'translateY(-50%)';
                break;
        }
        
        // Ensure content stays within viewport
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const currentRect = content.getBoundingClientRect();
        
        if (currentRect.left < 10) {
            content.style.left = '10px';
            content.style.transform = content.style.transform.replace('translateX(-50%)', '');
        }
        if (currentRect.right > viewportWidth - 10) {
            content.style.left = `${viewportWidth - contentRect.width - 10}px`;
            content.style.transform = content.style.transform.replace('translateX(-50%)', '');
        }
        if (currentRect.top < 10) {
            content.style.top = '10px';
            content.style.transform = content.style.transform.replace('translateY(-50%)', '');
        }
        if (currentRect.bottom > viewportHeight - 10) {
            content.style.top = `${viewportHeight - contentRect.height - 10}px`;
            content.style.transform = content.style.transform.replace('translateY(-50%)', '');
        }
    }
}

// Navigation functions
function nextTutorialStep() {
    if (currentStep < currentTutorial.length - 1) {
        currentStep++;
        showTutorialStep();
    } else {
        completeTutorial();
    }
}

function previousTutorialStep() {
    if (currentStep > 0) {
        currentStep--;
        showTutorialStep();
    }
}

function skipTutorial() {
    completeTutorial();
}

function completeTutorial() {
    tutorialActive = false;
    
    // Remove overlay
    const overlay = document.getElementById('tutorialOverlay');
    if (overlay) {
        overlay.remove();
    }
    
    // Remove highlights
    document.querySelectorAll('.tutorial-highlight').forEach(el => {
        el.classList.remove('tutorial-highlight');
    });
    
    // Mark tutorial as completed
    if (currentTutorial) {
        const pageType = detectPageType();
        localStorage.setItem(`tutorial_${pageType}_shown`, 'true');
        
        // If this was the first tutorial, mark overall tutorial as completed
        if (pageType === 'dashboard' || pageType === 'home') {
            localStorage.setItem('tutorialCompleted', 'true');
        }
    }
    
    // Always mark overall tutorial as completed when user manually completes/skips
    localStorage.setItem('tutorialCompleted', 'true');
    
    console.log('✅ Tutorial completed');
}

// Function to manually disable all tutorials
function disableAllTutorials() {
    localStorage.setItem('tutorialCompleted', 'true');
    localStorage.setItem('tutorial_home_shown', 'true');
    localStorage.setItem('tutorial_dashboard_shown', 'true');
    localStorage.setItem('tutorial_goal-detail_shown', 'true');
    localStorage.setItem('tutorial_community_shown', 'true');
    
    // Remove any active tutorial
    const overlay = document.getElementById('tutorialOverlay');
    if (overlay) {
        overlay.remove();
    }
    
    // Remove highlights
    document.querySelectorAll('.tutorial-highlight').forEach(el => {
        el.classList.remove('tutorial-highlight');
    });
    
    tutorialActive = false;
    console.log('🚫 All tutorials disabled');
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (!tutorialActive) return;
    
    switch (e.key) {
        case 'Escape':
            skipTutorial();
            break;
        case 'ArrowRight':
        case ' ':
            e.preventDefault();
            nextTutorialStep();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            previousTutorialStep();
            break;
    }
});

// Initialize tutorial system when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Increment login count for new user detection
    incrementLoginCount();
    
    // Track account creation for new users (only on registration)
    if (window.location.pathname.includes('/register') || window.location.search.includes('registered=true')) {
        localStorage.setItem('accountCreatedDate', new Date().toISOString());
    }
    
    // Auto-start tutorial for new users
    setTimeout(() => {
        checkAutoStartTutorial();
    }, 1000);
});

// Export functions for global use
window.startTutorial = startTutorial;
window.nextTutorialStep = nextTutorialStep;
window.previousTutorialStep = previousTutorialStep;
window.skipTutorial = skipTutorial;
window.checkAutoStartTutorial = checkAutoStartTutorial;
window.disableAllTutorials = disableAllTutorials; 