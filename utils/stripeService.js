// Initialize Stripe with proper error handling
const dotenv = require('dotenv');

// Make sure environment variables are loaded
dotenv.config();

let stripe;
let useMockService = process.env.USE_STRIPE_MOCK === 'true';

try {
    // Check if we're explicitly setting mock mode or missing Stripe keys
    if (useMockService || !process.env.STRIPE_SECRET_KEY) {
        console.log('Using mock Stripe service - no real charges will occur');
        useMockService = true;
    } else {
        // Only initialize Stripe if we're NOT using mock service
        stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        console.log('Stripe initialized successfully');
        
        // Verify the key works with a simple API call
        (async () => {
            try {
                // Try to list a single product to validate the API key
                await stripe.products.list({ limit: 1 });
                console.log('✅ Stripe API key verified successfully');
            } catch (error) {
                console.error('❌ Stripe API key validation failed:', error.message);
                console.log('Falling back to mock Stripe service - no real charges will occur');
                useMockService = true;
                // Don't use the real stripe instance if validation failed
                stripe = null;
            }
        })();
    }
} catch (error) {
    console.error('ERROR: Failed to initialize Stripe:', error.message);
    console.log('Using mock Stripe service - no real charges will occur');
    useMockService = true;
    stripe = null;
}

const db = require('../db/init');

// Product and price IDs for our subscription plans
// Get price IDs from environment variables
const PRODUCTS = {
    monthly: {
        name: 'Monthly Subscription',
        price_id: process.env.STRIPE_MONTHLY_PLAN_ID,
        amount: 1000, // £10.00 in pence
        interval: 'month'
    },
    annual: {
        name: 'Annual Subscription',
        price_id: process.env.STRIPE_ANNUAL_PLAN_ID,
        amount: 10000, // £100.00 in pence
        interval: 'year'
    }
};

// Mock implementations for development without Stripe keys
const mockCustomerId = 'cus_mock123456789';
const mockSubscriptionId = 'sub_mock123456789';
const mockSessionId = 'cs_mock123456789';

/**
 * IMPORTANT: This flag determines whether the system uses mock Stripe implementation or real API
 * This will be exported and should be used by other parts of the application for consistency
 */
function isMockStripeMode() {
    return useMockService;
}

// Create a customer in Stripe
async function createCustomer(email, name) {
    if (useMockService) {
        console.log('Mock: Creating customer for', email);
        return { id: mockCustomerId, email, name };
    }
    
    try {
        const customer = await stripe.customers.create({
            email,
            name
        });
        return customer;
    } catch (error) {
        console.error('Error creating Stripe customer:', error);
        throw error;
    }
}

// Get customer by ID
async function getCustomer(customerId) {
    if (useMockService) {
        console.log('Mock: Retrieving customer', customerId);
        return { id: mockCustomerId, email: 'mock@example.com', name: 'Mock User' };
    }
    
    try {
        return await stripe.customers.retrieve(customerId);
    } catch (error) {
        console.error('Error retrieving Stripe customer:', error);
        throw error;
    }
}

// Create a payment intent for a one-time payment
async function createPaymentIntent(amount, currency = 'gbp', customerId = null) {
    if (useMockService) {
        console.log('Mock: Creating payment intent for', amount, currency);
        return { id: 'pi_mock123456789', amount, currency, customer: customerId };
    }
    
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency,
            customer: customerId,
            payment_method_types: ['card'],
        });
        return paymentIntent;
    } catch (error) {
        console.error('Error creating payment intent:', error);
        throw error;
    }
}

// Create a subscription for a customer
async function createSubscription(customerId, priceId) {
    if (useMockService) {
        console.log('Mock: Creating subscription for', customerId);
        return { 
            id: mockSubscriptionId, 
            customer: customerId, 
            items: [{ price: { id: priceId } }],
            current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
        };
    }
    
    try {
        const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: priceId }],
            payment_behavior: 'default_incomplete',
            expand: ['latest_invoice.payment_intent']
        });
        return subscription;
    } catch (error) {
        console.error('Error creating subscription:', error);
        throw error;
    }
}

// Create a checkout session for subscription
async function createCheckoutSession(customerId, priceId, successUrl, cancelUrl) {
    // If in mock mode, always use mock data
    if (useMockService) {
        console.log('Mock: Creating checkout session with:', { 
            customerId, 
            priceId,
            successUrl: successUrl.substring(0, 50) + '...',
            cancelUrl: cancelUrl.substring(0, 50) + '...'
        });
        
        // Make sure we're using a mock customer ID that starts with mock_
        // If someone passes a real customer ID but we're in mock mode, convert it
        const mockCustId = customerId.startsWith('cus_mock') ? 
            customerId : mockCustomerId;
            
        return { 
            id: mockSessionId, 
            url: successUrl.replace('?plan=', '?session_id=' + mockSessionId + '&plan=')
        };
    }
    
    try {
        console.log('Real Stripe: Creating checkout session');
        
        // We should only get here if we have a valid Stripe instance
        if (!stripe) {
            console.error('Stripe not initialized but trying to create real checkout session');
            throw new Error('Stripe not properly initialized');
        }
        
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: successUrl,
            cancel_url: cancelUrl,
        });
        return session;
    } catch (error) {
        console.error('Error creating checkout session:', error);
        // Don't fall back to mock mode - let the caller handle the error
        throw error;
    }
}

// Get or create a Stripe customer for the user
async function getOrCreateCustomerForUser(userId) {
    // If in mock mode, always use mock data
    if (useMockService) {
        console.log('Mock: Getting/creating customer for user', userId);
        return { 
            id: mockCustomerId, 
            email: 'mock@example.com', 
            name: 'Mock User',
            isMockCustomer: true
        };
    }
    
    try {
        console.log('Real Stripe: Getting/creating customer for user', userId);
        
        // We should only get here if we have a valid Stripe instance
        if (!stripe) {
            console.error('Stripe not initialized but trying to get/create real customer');
            throw new Error('Stripe not properly initialized');
        }
        
        // Check if user already has a Stripe customer ID
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT email, username, stripe_customer_id FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!user) {
            throw new Error('User not found');
        }

        // If user has a stored customer ID that's not a mock ID, use it
        if (user.stripe_customer_id && !user.stripe_customer_id.includes('mock')) {
            try {
                // If user already has a Stripe customer ID, retrieve the customer
                return await getCustomer(user.stripe_customer_id);
            } catch (error) {
                // If customer not found in Stripe, create a new one
                console.log('Customer ID not found in Stripe, creating new customer');
                const newCustomer = await createCustomer(user.email, user.username);
                
                // Update user record with new Stripe customer ID
                await new Promise((resolve, reject) => {
                    db.run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [newCustomer.id, userId], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                
                return newCustomer;
            }
        } else {
            // Create a new customer
            const customer = await createCustomer(user.email, user.username);
            
            // Update user record with Stripe customer ID
            await new Promise((resolve, reject) => {
                db.run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', [customer.id, userId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            return customer;
        }
    } catch (error) {
        console.error('Error in getOrCreateCustomerForUser:', error);
        
        // If there's an error with the real API and we're not already in mock mode,
        // we need to decide whether to fail or fall back to mock mode
        if (!useMockService) {
            // Re-throw the error for proper handling upstream
            throw error;
        }
        
        // This should not happen, but just in case - provide a fallback mock
        console.log('UNEXPECTED: Falling back to mock customer due to error');
        return { 
            id: mockCustomerId, 
            email: 'fallback@example.com', 
            name: 'Fallback User',
            isMockCustomer: true,
            isFallback: true
        };
    }
}

// Cancel a subscription
async function cancelSubscription(subscriptionId) {
    if (useMockService) {
        console.log('Mock: Cancelling subscription', subscriptionId);
        return { id: subscriptionId, status: 'canceled' };
    }
    
    // Skip cancellation if subscription ID format doesn't look like a real Stripe ID
    if (!subscriptionId || subscriptionId.startsWith('sub_mock') || subscriptionId.startsWith('sub_real_')) {
        console.log('Skipping cancellation for non-Stripe subscription ID:', subscriptionId);
        return { id: subscriptionId, status: 'canceled', skipped: true };
    }
    
    try {
        console.log('Real Stripe: Cancelling subscription', subscriptionId);
        
        // We should only get here if we have a valid Stripe instance
        if (!stripe) {
            console.error('Stripe not initialized but trying to cancel real subscription');
            throw new Error('Stripe not properly initialized');
        }
        
        // Cancel at period end to avoid immediate cancellation
        // const subscription = await stripe.subscriptions.update(
        //     subscriptionId,
        //     {cancel_at_period_end: true}
        // );
        
        // For immediate cancellation, use this instead:
        const subscription = await stripe.subscriptions.del(subscriptionId);
        
        console.log('Successfully cancelled subscription in Stripe');
        return subscription;
    } catch (error) {
        console.error('Error canceling subscription:', error);
        
        // If the subscription doesn't exist, handle gracefully
        if (error.code === 'resource_missing') {
            console.log('Subscription not found in Stripe, might have been already cancelled');
            return { id: subscriptionId, status: 'canceled', missing: true };
        }
        
        throw error;
    }
}

// Update user's subscription status in database
async function updateUserSubscriptionStatus(userId, planType, subscriptionId, endDate) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE users SET subscription_plan = ?, subscription_id = ?, subscription_end = ? WHERE id = ?',
            [planType, subscriptionId, endDate, userId],
            (err) => {
                if (err) {
                    console.error('Error updating user subscription status:', err);
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}

// Get subscription plans with prices
function getSubscriptionPlans() {
    return PRODUCTS;
}

module.exports = {
    createCustomer,
    getCustomer,
    createPaymentIntent,
    createSubscription,
    createCheckoutSession,
    getOrCreateCustomerForUser,
    cancelSubscription,
    updateUserSubscriptionStatus,
    getSubscriptionPlans,
    PRODUCTS,
    isMockStripeMode
}; 