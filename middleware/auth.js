const db = require('../db/init');

/**
 * Middleware to check if user is authenticated
 */
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

/**
 * Middleware to check if user has a premium subscription
 * Redirects to subscription page if not
 */
const isPremiumUser = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    const isPremium = req.session.user.subscription_plan === 'monthly' || 
                      req.session.user.subscription_plan === 'annual';
    
    if (isPremium) {
        next();
    } else {
        // User is on free plan
        res.redirect('/subscription?error=premium_required');
    }
};

/**
 * Middleware to limit the number of goals for free users (now disabled)
 * All users can create unlimited goals
 */
const checkGoalLimit = (req, res, next) => {
    // No limit on the number of goals
    next();
};

module.exports = {
    isAuthenticated,
    isPremiumUser,
    checkGoalLimit
}; 