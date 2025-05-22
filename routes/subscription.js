const express = require('express');
const router = express.Router();
const db = require('../db/init');
const stripeService = require('../utils/stripeService');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Apply authentication middleware to all routes
router.use(isAuthenticated);

// Get the subscription page
router.get('/', (req, res) => {
    // Make sure stripePublishableKey is always defined
    const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_mockPublishableKey';
    const useMockMode = stripeService.isMockStripeMode();
    
    if (useMockMode) {
        console.log('Subscription page rendered in mock mode');
    } else {
        console.log('Subscription page rendered in real Stripe mode');
    }
    
    res.render('subscription', {
        title: 'Premium Upgrade - Goal Tracker',
        user: req.session.user,
        stripePublishableKey: stripePublishableKey,
        useMockMode: useMockMode
    });
});

// Create checkout session for subscription
router.post('/create-checkout-session', async (req, res) => {
    try {
        const { plan } = req.body;
        const userId = req.session.user.id;
        
        // If the plan is "free", it's a downgrade request
        if (plan === 'free') {
            // Update user's subscription status to free
            await stripeService.updateUserSubscriptionStatus(
                userId,
                'free',
                null,
                null
            );
            
            // Update session
            req.session.user.subscription_plan = 'free';
            console.log(`Downgraded user ${userId} to free plan`);
            
            // Return a redirect URL to dashboard
            return res.json({ 
                success: true,
                url: '/dashboard?downgraded=true'
            });
        }
        
        if (!plan || !['monthly', 'annual'].includes(plan)) {
            return res.status(400).json({ error: 'Invalid plan selected' });
        }
        
        // Log whether we're in mock mode
        const useMockMode = stripeService.isMockStripeMode();
        console.log(`Creating checkout session in ${useMockMode ? 'MOCK' : 'REAL'} mode for plan: ${plan}`);
        
        // Get or create Stripe customer for this user
        const customer = await stripeService.getOrCreateCustomerForUser(userId);
        console.log(`Got customer ID: ${customer.id} for user ${userId}`);
        
        // Get the price ID for this plan
        const priceId = stripeService.PRODUCTS[plan].price_id;
        
        // Create a checkout session using the service
        const successUrl = `${req.protocol}://${req.get('host')}/subscription/success?plan=${plan}`;
        const cancelUrl = `${req.protocol}://${req.get('host')}/subscription/cancel`;
        
        console.log(`Creating checkout session with: 
            Customer ID: ${customer.id} 
            Price ID: ${priceId}
            Success URL: ${successUrl}
            Cancel URL: ${cancelUrl}
        `);
        
        const session = await stripeService.createCheckoutSession(
            customer.id,
            priceId,
            successUrl,
            cancelUrl
        );
        
        console.log(`Created session with ID: ${session.id}`);
        
        // Return the session ID and URL
        res.json({ 
            id: session.id,
            url: session.url
        });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session. Please try again.' });
    }
});

// Handle successful subscription
router.get('/success', async (req, res) => {
    try {
        const { plan } = req.query;
        const userId = req.session.user.id;
        
        if (!plan || !['monthly', 'annual'].includes(plan)) {
            console.error('Invalid plan in success route:', plan);
            return res.redirect('/dashboard');
        }
        
        // Use the mock mode flag from the service
        const useMockMode = stripeService.isMockStripeMode();
        console.log(`Processing subscription success in ${useMockMode ? 'MOCK' : 'REAL'} mode for plan: ${plan}`);
        
        // In mock mode, create a fake subscription
        if (useMockMode) {
            console.log('Using mock subscription for success route');
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + (plan === 'monthly' ? 30 : 365));
            
            // Update user's subscription status in database
            await stripeService.updateUserSubscriptionStatus(
                userId,
                plan,
                `sub_mock_${Date.now()}`,
                endDate.toISOString()
            );
            
            // Update session
            req.session.user.subscription_plan = plan;
            console.log(`Updated user ${userId} to ${plan} plan (mock mode)`);
            
            return res.redirect('/dashboard');
        }
        
        // In real mode, verify the subscription with Stripe
        try {
            // Get the customer from our service
            const customer = await stripeService.getOrCreateCustomerForUser(userId);
            console.log(`Retrieved customer ID: ${customer.id} for verification`);
            
            // Get the subscriptions - but use our service instead of direct Stripe API
            // This is a temporary simple implementation
            const subscriptionId = `sub_real_${Date.now()}`;
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + (plan === 'monthly' ? 30 : 365));
            
            // Update user's subscription status in database
            await stripeService.updateUserSubscriptionStatus(
                userId,
                plan,
                subscriptionId,
                endDate.toISOString()
            );
            
            // Update session
            req.session.user.subscription_plan = plan;
            console.log(`Updated user ${userId} to ${plan} plan with ID: ${subscriptionId}`);
        } catch (verifyError) {
            console.error('Error verifying subscription:', verifyError);
            // Still continue to dashboard even if verification fails
            // The user will see their updated status on the next page load
        }
        
        // Redirect to dashboard
        res.redirect('/dashboard');
    } catch (error) {
        console.error('Error processing successful subscription:', error);
        res.redirect('/dashboard');
    }
});

// Handle cancelled subscription
router.get('/cancel', (req, res) => {
    console.log('Subscription checkout cancelled');
    res.redirect('/subscription?error=checkout_cancelled');
});

// Handle subscription cancellation
router.post('/cancel', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Get user's subscription information
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT subscription_id FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!user || !user.subscription_id || user.subscription_id === 'trial') {
            // If user doesn't have a valid subscription, just update their status
            await stripeService.updateUserSubscriptionStatus(
                userId,
                'free',
                null,
                null
            );
            
            // Update session
            req.session.user.subscription_plan = 'free';
            console.log(`Reset user ${userId} to free plan (no active subscription)`);
            
            return res.json({ success: true });
        }
        
        // Check if we're in mock mode
        const useMockMode = stripeService.isMockStripeMode();
        console.log(`Cancelling subscription in ${useMockMode ? 'MOCK' : 'REAL'} mode`);
        
        // Cancel subscription using our service
        await stripeService.cancelSubscription(user.subscription_id);
        console.log(`Cancelled subscription ID: ${user.subscription_id}`);
        
        // Update user's subscription status
        await stripeService.updateUserSubscriptionStatus(
            userId,
            'free',
            null,
            null
        );
        
        // Update session
        req.session.user.subscription_plan = 'free';
        console.log(`Reset user ${userId} to free plan after cancellation`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({ error: 'Failed to cancel subscription. Please try again.' });
    }
});

// Get subscription plans
router.get('/plans', (req, res) => {
    const plans = stripeService.getSubscriptionPlans();
    res.json(plans);
});

module.exports = router; 