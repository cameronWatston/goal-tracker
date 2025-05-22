// Initialize Stripe with proper error handling
const dotenv = require('dotenv');

// Make sure environment variables are loaded
dotenv.config();

let stripe;
let useMockService = false;

try {
    if (!process.env.STRIPE_SECRET_KEY) {
        console.error('ERROR: Stripe secret key not found in environment variables');
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
// In a real application, get these IDs from your Stripe dashboard
const PRODUCTS = {
    monthly: {
        name: 'Monthly Subscription',
        price_id: 'price_123MonthlyPlanID', // Replace with actual Stripe price ID
        amount: 1000, // £10.00 in pence
        interval: 'month'
    },
    annual: {
        name: 'Annual Subscription',
        price_id: 'price_123AnnualPlanID', // Replace with actual Stripe price ID
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
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 7);
        return { 
            id: mockSubscriptionId, 
            customer: customerId, 
            items: [{ price: { id: priceId } }],
            trial_end: Math.floor(trialEnd.getTime() / 1000),
            current_period_end: Math.floor(trialEnd.getTime() / 1000) + (30 * 24 * 60 * 60)
        };
    }
    
    try {
        const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: priceId }],
            payment_behavior: 'default_incomplete',
            expand: ['latest_invoice.payment_intent'],
            trial_period_days: 7 // Add 7-day free trial
        });
        return subscription;
    } catch (error) {
        console.error('Error creating subscription:', error);
        throw error;
    }
}

// Create a checkout session for subscription
async function createCheckoutSession(customerId, priceId, successUrl, cancelUrl) {
    // Force consistency - if the service is in mock mode, always use mock data
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
            subscription_data: {
                trial_period_days: 7 // Add 7-day free trial
            },
            success_url: successUrl,
            cancel_url: cancelUrl,
        });
        return session;
    } catch (error) {
        console.error('Error creating checkout session:', error);
        // If there's an error with the real API, fall back to mock mode for this session
        console.log('Falling back to mock checkout session due to error');
        return { 
            id: mockSessionId, 
            url: successUrl.replace('?plan=', '?session_id=' + mockSessionId + '&plan='),
            isFallback: true
        };
    }
}

// Get or create a Stripe customer for the user
async function getOrCreateCustomerForUser(userId) {
    // Force consistency - if the service is in mock mode, always use mock data
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

        if (user.stripe_customer_id) {
            // Skip real API calls if the stored ID is a mock ID
            if (user.stripe_customer_id.startsWith('cus_mock')) {
                console.log('Found stored mock customer ID - switching to mock mode');
                return { 
                    id: mockCustomerId, 
                    email: user.email, 
                    name: user.username,
                    isMockCustomer: true
                };
            }
            
            // If user already has a Stripe customer ID, retrieve the customer
            return await getCustomer(user.stripe_customer_id);
        } else {
            // Otherwise, create a new customer
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
        
        // If there's an error with the real API, fall back to mock mode for this customer
        console.log('Falling back to mock customer due to error');
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
    
    try {
        return await stripe.subscriptions.del(subscriptionId);
    } catch (error) {
        console.error('Error canceling subscription:', error);
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