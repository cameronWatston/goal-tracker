/**
 * Middleware to check if a user has premium subscription
 */

/**
 * Checks if the user has a premium subscription
 * Used for protecting premium-only routes
 */
const isPremium = (req, res, next) => {
  // Check if user is logged in
  if (!req.session.user) {
    return res.status(401).json({
      error: 'Authentication required',
      redirectUrl: '/login'
    });
  }

  // Check if user has a premium subscription
  if (req.session.user.subscription === 'premium' || 
      req.session.user.subscription_plan === 'monthly' || 
      req.session.user.subscription_plan === 'annual') {
    return next();
  }

  // User doesn't have premium subscription
  return res.status(403).json({
    error: 'Premium subscription required',
    upgradeUrl: '/subscription/upgrade'
  });
};

/**
 * For views that need to check subscription status
 * without blocking access
 */
const checkSubscriptionStatus = (req, res, next) => {
  if (req.session && req.session.user) {
    const user = req.session.user;
    res.locals.isPremium = 
      user.subscription === 'premium' || 
      user.subscription_plan === 'monthly' || 
      user.subscription_plan === 'annual';
  } else {
    res.locals.isPremium = false;
  }
  next();
};

module.exports = {
  isPremium,
  checkSubscriptionStatus
}; 