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
 * Middleware to check if user is an admin
 * Redirects to dashboard if not
 */
const isAdmin = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    // Check if is_admin property exists in the session
    if (req.session.user.is_admin) {
        next();
    } else {
        // If not in session, check the database
        db.get('SELECT is_admin FROM users WHERE id = ?', [req.session.user.id], (err, row) => {
            if (err) {
                console.error('Error checking admin status:', err);
                return res.redirect('/dashboard');
            }
            
            if (row && row.is_admin === 1) {
                // Update session with admin status
                req.session.user.is_admin = 1;
                next();
            } else {
                res.redirect('/dashboard');
            }
        });
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
    isAdmin,
    isPremiumUser,
    checkGoalLimit
}; 