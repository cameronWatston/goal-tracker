const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { isAdmin } = require('../middleware/auth');
const stripeService = require('../utils/stripeService');
const { getIPAnalytics, getTopIPs, getRecentIPVisits, getIPTrends } = require('../middleware/ipTracking');
const { getActivityAnalytics, getUserActivityStats, getRecentUserActivities } = require('../middleware/activityTracker');

// Apply admin middleware to all routes
router.use(isAdmin);

// Admin dashboard
router.get('/', async (req, res) => {
    try {
        // Get comprehensive real metrics including IP analytics
        const [
            userCount, 
            goalCount, 
            postCount,
            premiumCount,
            recentUsers,
            userGrowthData,
            goalCompletionData,
            revenueData,
            communityStats,
            systemStats,
            ipAnalytics,
            activityAnalytics
        ] = await Promise.all([
            getUserCount(),
            getGoalCount(),
            getPostCount(),
            getPremiumUserCount(),
            getRecentUsers(5),
            getUserGrowthMetrics(),
            getGoalCompletionMetrics(),
            getRevenueMetrics(),
            getCommunityStats(),
            getSystemStats(),
            getIPAnalytics(),
            getActivityAnalytics()
        ]);
        
        res.render('admin/dashboard', {
            title: 'Admin Dashboard - Goal Tracker',
            userCount,
            goalCount,
            postCount,
            premiumCount,
            recentUsers,
            userGrowthData,
            goalCompletionData,
            revenueData,
            communityStats,
            systemStats,
            ipAnalytics,
            activityAnalytics,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        res.status(500).render('error', {
            title: 'Error - Goal Tracker',
            error: 'Failed to load admin dashboard'
        });
    }
});

// User management - list all users
router.get('/users', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;
        
        // Get users with pagination and activity data
        const users = await new Promise((resolve, reject) => {
            db.all(`
                SELECT id, username, email, created_at, subscription_plan, is_admin, is_verified,
                       last_activity, last_login, total_sessions, last_ip_address
                FROM users
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            `, [limit, offset], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // Get total user count for pagination
        const totalUsers = await getUserCount();
        const totalPages = Math.ceil(totalUsers / limit);
        
        res.render('admin/users', {
            title: 'User Management - Admin',
            users,
            currentPage: page,
            totalPages,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading user list:', error);
        res.status(500).render('error', {
            title: 'Error - Goal Tracker',
            error: 'Failed to load user list'
        });
    }
});

// View user details
router.get('/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Get user details
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!user) {
            return res.status(404).render('error', {
                title: 'Error - Goal Tracker',
                error: 'User not found'
            });
        }
        
        // Get user's goals
        const goals = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // Get user's posts
        const posts = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        res.render('admin/user-detail', {
            title: `User: ${user.username} - Admin`,
            userDetail: user,
            goals,
            posts,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading user details:', error);
        res.status(500).render('error', {
            title: 'Error - Goal Tracker',
            error: 'Failed to load user details'
        });
    }
});

// Upgrade user subscription
router.post('/users/:id/upgrade', async (req, res) => {
    try {
        const userId = req.params.id;
        const { plan } = req.body;
        
        if (!plan || !['monthly', 'annual', 'free'].includes(plan)) {
            return res.status(400).json({ error: 'Invalid plan type' });
        }
        
        // If downgrading to free plan
        if (plan === 'free') {
            // Get user's current subscription information
            const user = await new Promise((resolve, reject) => {
                db.get('SELECT subscription_id FROM users WHERE id = ?', [userId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            // If user has an active subscription, cancel it in Stripe
            if (user && user.subscription_id) {
                try {
                    // Cancel the subscription with Stripe
                    await stripeService.cancelSubscription(user.subscription_id);
                    console.log(`Admin cancelled subscription ID: ${user.subscription_id} for user ${userId}`);
                } catch (cancelError) {
                    console.error('Error cancelling subscription:', cancelError);
                    // Continue with downgrade even if there's an error with Stripe
                }
            }
            
            // Update user's subscription status to free
            await stripeService.updateUserSubscriptionStatus(
                userId,
                'free',
                null,
                null
            );
            
            console.log(`Admin downgraded user ${userId} to free plan`);
            
            return res.json({ success: true });
        }
        
        // For premium plans (monthly/annual)
        // Get or create Stripe customer for the user
        const customer = await stripeService.getOrCreateCustomerForUser(userId);
        
        // Calculate end date based on plan type
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + (plan === 'monthly' ? 30 : 365));
        
        // Create a subscription reference
        const subscriptionId = `sub_admin_${Date.now()}`;
        
        // Update user's subscription status in database
        await stripeService.updateUserSubscriptionStatus(
            userId,
            plan,
            subscriptionId,
            endDate.toISOString()
        );
        
        console.log(`Admin upgraded user ${userId} to ${plan} plan`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error upgrading user:', error);
        res.status(500).json({ error: 'Failed to upgrade user' });
    }
});

// Set/unset admin status
router.post('/users/:id/set-admin', async (req, res) => {
    try {
        const userId = req.params.id;
        const { isAdmin } = req.body;
        
        if (isAdmin === undefined) {
            return res.status(400).json({ error: 'Missing isAdmin parameter' });
        }
        
        // Cannot remove admin status from yourself
        if (parseInt(userId) === req.session.user.id && !isAdmin) {
            return res.status(400).json({ error: 'Cannot remove your own admin status' });
        }
        
        // Update admin status
        await new Promise((resolve, reject) => {
            db.run('UPDATE users SET is_admin = ? WHERE id = ?', [isAdmin ? 1 : 0, userId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        console.log(`Set admin status to ${isAdmin ? 'true' : 'false'} for user ${userId}`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error setting admin status:', error);
        res.status(500).json({ error: 'Failed to update admin status' });
    }
});

// Delete user
router.post('/users/:id/delete', async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Cannot delete yourself
        if (parseInt(userId) === req.session.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account from admin panel' });
        }
        
        // Delete user's records
        await deleteUserRecords(userId);
        
        console.log(`Admin deleted user ${userId}`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Post moderation - list all posts
router.get('/posts', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;
        
        // Get posts with pagination
        const posts = await new Promise((resolve, reject) => {
            db.all(`
                SELECT p.*, u.username
                FROM posts p
                JOIN users u ON p.user_id = u.id
                ORDER BY p.created_at DESC
                LIMIT ? OFFSET ?
            `, [limit, offset], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // Get total post count for pagination
        const totalPosts = await getPostCount();
        const totalPages = Math.ceil(totalPosts / limit);
        
        res.render('admin/posts', {
            title: 'Post Moderation - Admin',
            posts,
            currentPage: page,
            totalPages,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading post list:', error);
        res.status(500).render('error', {
            title: 'Error - Goal Tracker',
            error: 'Failed to load post list'
        });
    }
});

// Delete post
router.post('/posts/:id/delete', async (req, res) => {
    try {
        const postId = req.params.id;
        
        // Delete comments first
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM comments WHERE post_id = ?', [postId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // Delete post likes
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM post_likes WHERE post_id = ?', [postId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // Delete post
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM posts WHERE id = ?', [postId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        console.log(`Admin deleted post ${postId}`);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});

// SEO Settings Management
router.get('/seo', async (req, res) => {
    try {
        // Get all SEO settings
        const seoSettings = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM seo_settings ORDER BY page_path', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('admin/seo', {
            title: 'SEO Settings - Admin Dashboard',
            seoSettings,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading SEO settings:', error);
        res.status(500).render('error', {
            title: 'Error - Goal Tracker',
            error: 'Failed to load SEO settings'
        });
    }
});

// Add new SEO setting
router.post('/seo', async (req, res) => {
    try {
        const {
            page_path, title, description, keywords,
            og_title, og_description, og_image,
            twitter_title, twitter_description, twitter_image,
            canonical_url, structured_data, custom_meta
        } = req.body;

        await new Promise((resolve, reject) => {
            db.run(`INSERT INTO seo_settings 
                (page_path, title, description, keywords, og_title, og_description, og_image,
                 twitter_title, twitter_description, twitter_image, canonical_url, 
                 structured_data, custom_meta, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [page_path, title, description, keywords, og_title, og_description, og_image,
                 twitter_title, twitter_description, twitter_image, canonical_url,
                 structured_data, custom_meta],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error creating SEO setting:', error);
        res.status(500).json({ error: 'Failed to create SEO setting' });
    }
});

// Update SEO setting
router.put('/seo/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            page_path, title, description, keywords,
            og_title, og_description, og_image,
            twitter_title, twitter_description, twitter_image,
            canonical_url, structured_data, custom_meta, is_active
        } = req.body;

        await new Promise((resolve, reject) => {
            db.run(`UPDATE seo_settings SET 
                page_path = ?, title = ?, description = ?, keywords = ?,
                og_title = ?, og_description = ?, og_image = ?,
                twitter_title = ?, twitter_description = ?, twitter_image = ?,
                canonical_url = ?, structured_data = ?, custom_meta = ?,
                is_active = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [page_path, title, description, keywords, og_title, og_description, og_image,
                 twitter_title, twitter_description, twitter_image, canonical_url,
                 structured_data, custom_meta, is_active, id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                });
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating SEO setting:', error);
        res.status(500).json({ error: 'Failed to update SEO setting' });
    }
});

// Delete SEO setting
router.delete('/seo/:id', async (req, res) => {
    try {
        const { id } = req.params;

        await new Promise((resolve, reject) => {
            db.run('DELETE FROM seo_settings WHERE id = ?', [id], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting SEO setting:', error);
        res.status(500).json({ error: 'Failed to delete SEO setting' });
    }
});

// User Activity Analytics page
router.get('/user-activity', async (req, res) => {
    try {
        // Get comprehensive user activity analytics
        const activityAnalytics = await getActivityAnalytics();
        
        // Get recent activity logs (last 100)
        const recentActivities = await new Promise((resolve, reject) => {
            db.all(`
                SELECT ual.*, u.username 
                FROM user_activity_logs ual
                JOIN users u ON ual.user_id = u.id
                ORDER BY ual.created_at DESC
                LIMIT 100
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // Get online users (active in last 5 minutes)
        const onlineUsers = await new Promise((resolve, reject) => {
            db.all(`
                SELECT u.id, u.username, u.last_activity, u.last_ip_address
                FROM users u
                WHERE u.last_activity >= datetime('now', '-5 minutes')
                ORDER BY u.last_activity DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // Get activity trends by hour for today
        const hourlyActivity = await new Promise((resolve, reject) => {
            db.all(`
                SELECT strftime('%H', created_at) as hour, COUNT(*) as count
                FROM user_activity_logs 
                WHERE date(created_at) = date('now')
                GROUP BY strftime('%H', created_at)
                ORDER BY hour
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('admin/user-activity', {
            title: 'User Activity Analytics - Admin',
            activityAnalytics,
            recentActivities,
            onlineUsers,
            hourlyActivity,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading user activity analytics:', error);
        res.status(500).render('error', {
            title: 'Error - Goal Tracker',
            error: 'Failed to load user activity analytics'
        });
    }
});

// View specific user activity
router.get('/users/:id/activity', async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Get user details
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!user) {
            return res.status(404).render('error', {
                title: 'Error - Goal Tracker',
                error: 'User not found'
            });
        }
        
        // Get user activity stats
        const activityStats = await getUserActivityStats(userId);
        
        // Get recent activities
        const recentActivities = await getRecentUserActivities(userId, 100);
        
        // Get activity by type for this user
        const activityByType = await new Promise((resolve, reject) => {
            db.all(`
                SELECT activity_type, COUNT(*) as count
                FROM user_activity_logs
                WHERE user_id = ?
                GROUP BY activity_type
                ORDER BY count DESC
            `, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('admin/user-activity-detail', {
            title: `Activity: ${user.username} - Admin`,
            userDetail: user,
            activityStats,
            recentActivities,
            activityByType,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading user activity details:', error);
        res.status(500).render('error', {
            title: 'Error - Goal Tracker',
            error: 'Failed to load user activity details'
        });
    }
});

// IP Analytics page
router.get('/ip-analytics', async (req, res) => {
    try {
        // Get comprehensive IP analytics data
        const [
            ipAnalytics,
            topIPs,
            recentVisits,
            ipTrends
        ] = await Promise.all([
            getIPAnalytics(),
            getTopIPs(20),
            getRecentIPVisits(50),
            getIPTrends()
        ]);

        res.render('admin/ip-analytics', {
            title: 'IP Analytics - Admin',
            ipAnalytics,
            topIPs,
            recentVisits,
            ipTrends,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading IP analytics:', error);
        res.status(500).render('error', {
            title: 'Error - Goal Tracker',
            error: 'Failed to load IP analytics'
        });
    }
});

// Helper functions
async function getUserCount() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
}

async function getGoalCount() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM goals', (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
}

async function getPostCount() {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM posts', (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
}

async function getPremiumUserCount() {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT COUNT(*) as count 
            FROM users 
            WHERE subscription_plan IN ('monthly', 'annual')
        `, (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
        });
    });
}

async function getRecentUsers(limit) {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT id, username, email, created_at, subscription_plan
            FROM users
            ORDER BY created_at DESC
            LIMIT ?
        `, [limit], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Real user growth metrics
async function getUserGrowthMetrics() {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                COUNT(CASE WHEN DATE(created_at) >= DATE('now', '-30 days') THEN 1 END) as last_30_days,
                COUNT(CASE WHEN DATE(created_at) >= DATE('now', '-60 days') AND DATE(created_at) < DATE('now', '-30 days') THEN 1 END) as previous_30_days,
                COUNT(CASE WHEN DATE(created_at) >= DATE('now', '-7 days') THEN 1 END) as last_7_days,
                COUNT(CASE WHEN DATE(created_at) >= DATE('now', '-1 day') THEN 1 END) as last_24_hours
            FROM users
        `, (err, rows) => {
            if (err) {
                console.error('Error in getUserGrowthMetrics:', err);
                reject(err);
            } else {
                const data = rows[0];
                const growthRate = data.previous_30_days > 0 
                    ? ((data.last_30_days - data.previous_30_days) / data.previous_30_days * 100).toFixed(1)
                    : data.last_30_days > 0 ? 100 : 0;
                
                resolve({
                    last_30_days: data.last_30_days,
                    previous_30_days: data.previous_30_days,
                    growth_rate: growthRate,
                    last_7_days: data.last_7_days,
                    last_24_hours: data.last_24_hours
                });
            }
        });
    });
}

// Real goal completion metrics
async function getGoalCompletionMetrics() {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                COUNT(*) as total_goals,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_goals,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_goals,
                COUNT(CASE WHEN DATE(created_at) >= DATE('now', '-30 days') THEN 1 END) as goals_last_30_days,
                COUNT(CASE WHEN DATE(created_at) >= DATE('now', '-60 days') AND DATE(created_at) < DATE('now', '-30 days') THEN 1 END) as goals_previous_30_days,
                AVG(CASE WHEN status = 'completed' AND target_date IS NOT NULL 
                    THEN (julianday(target_date) - julianday(start_date)) END) as avg_completion_days
            FROM goals
        `, (err, rows) => {
            if (err) reject(err);
            else {
                const data = rows[0];
                const completion_rate = data.total_goals > 0 
                    ? (data.completed_goals / data.total_goals * 100).toFixed(1)
                    : 0;
                
                const goals_growth_rate = data.goals_previous_30_days > 0 
                    ? ((data.goals_last_30_days - data.goals_previous_30_days) / data.goals_previous_30_days * 100).toFixed(1)
                    : 0;
                
                resolve({
                    total_goals: data.total_goals,
                    completed_goals: data.completed_goals,
                    active_goals: data.active_goals,
                    completion_rate: completion_rate,
                    goals_last_30_days: data.goals_last_30_days,
                    goals_growth_rate: goals_growth_rate,
                    avg_completion_days: Math.round(data.avg_completion_days || 0)
                });
            }
        });
    });
}

// Real revenue metrics
async function getRevenueMetrics() {
    return new Promise(async (resolve, reject) => {
        try {
            const totalUserCount = await getUserCount();
            
            db.all(`
                SELECT 
                    COUNT(CASE WHEN subscription_plan = 'monthly' AND stripe_customer_id IS NOT NULL THEN 1 END) as monthly_subscribers,
                    COUNT(CASE WHEN subscription_plan = 'annual' AND stripe_customer_id IS NOT NULL THEN 1 END) as annual_subscribers,
                    COUNT(CASE WHEN subscription_plan IN ('monthly', 'annual') 
                        AND stripe_customer_id IS NOT NULL
                        AND DATE(subscription_start) >= DATE('now', '-30 days') THEN 1 END) as new_subscribers_30_days,
                    COUNT(CASE WHEN subscription_plan IN ('monthly', 'annual') 
                        AND stripe_customer_id IS NOT NULL
                        AND DATE(subscription_start) >= DATE('now', '-1 day') THEN 1 END) as new_subscribers_today,
                    COUNT(CASE WHEN subscription_plan IN ('monthly', 'annual') 
                        AND stripe_customer_id IS NOT NULL
                        AND DATE(subscription_start) >= DATE('now', '-60 days') 
                        AND DATE(subscription_start) < DATE('now', '-30 days') THEN 1 END) as previous_30_days_subscribers,
                    COUNT(CASE WHEN subscription_plan IN ('monthly', 'annual') THEN 1 END) as total_premium_users
                FROM users
            `, (err, rows) => {
                if (err) reject(err);
                else {
                    const data = rows[0];
                    
                    // Calculate revenue only from real paid subscriptions (£12.99 monthly, £119.19 annual)
                    const monthly_revenue = data.monthly_subscribers * 12.99;
                    const annual_revenue = data.annual_subscribers * 119.19;
                    const total_monthly_revenue = monthly_revenue + (annual_revenue / 12);
                    
                    const daily_revenue = data.new_subscribers_today * 12.99; // Simplified
                    
                    const revenue_growth = data.previous_30_days_subscribers > 0 
                        ? ((data.new_subscribers_30_days - data.previous_30_days_subscribers) / data.previous_30_days_subscribers * 100).toFixed(1)
                        : data.new_subscribers_30_days > 0 ? 100 : 0;
                    
                    const conversion_rate = totalUserCount > 0 
                        ? ((data.total_premium_users) / totalUserCount * 100).toFixed(1)
                        : 0;
                    
                    resolve({
                        monthly_subscribers: data.monthly_subscribers,
                        annual_subscribers: data.annual_subscribers,
                        total_monthly_revenue: total_monthly_revenue.toFixed(2),
                        daily_revenue: daily_revenue.toFixed(2),
                        new_subscribers_30_days: data.new_subscribers_30_days,
                        revenue_growth: revenue_growth,
                        conversion_rate: conversion_rate,
                        total_premium_users: data.total_premium_users
                    });
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

// Real community stats
async function getCommunityStats() {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                (SELECT COUNT(*) FROM posts) as total_posts,
                (SELECT COUNT(*) FROM comments) as total_comments,
                (SELECT COUNT(*) FROM post_likes) as total_likes,
                (SELECT COUNT(*) FROM posts WHERE DATE(created_at) >= DATE('now', '-30 days')) as posts_last_30_days,
                (SELECT COUNT(*) FROM posts WHERE DATE(created_at) >= DATE('now', '-60 days') AND DATE(created_at) < DATE('now', '-30 days')) as posts_previous_30_days,
                (SELECT COUNT(DISTINCT user_id) FROM posts WHERE DATE(created_at) >= DATE('now', '-30 days')) as active_posters_30_days
        `, (err, rows) => {
            if (err) {
                console.error('Error in getCommunityStats:', err);
                reject(err);
            } else {
                const data = rows[0];
                const posts_growth = data.posts_previous_30_days > 0 
                    ? ((data.posts_last_30_days - data.posts_previous_30_days) / data.posts_previous_30_days * 100).toFixed(1)
                    : data.posts_last_30_days > 0 ? 100 : 0;
                
                const avg_likes_per_post = data.total_posts > 0 
                    ? (data.total_likes / data.total_posts).toFixed(1) 
                    : 0;
                
                resolve({
                    total_posts: data.total_posts,
                    total_comments: data.total_comments,
                    total_likes: data.total_likes,
                    posts_last_30_days: data.posts_last_30_days,
                    posts_growth: posts_growth,
                    active_posters_30_days: data.active_posters_30_days,
                    avg_likes_per_post: avg_likes_per_post
                });
            }
        });
    });
}

// Real system stats
async function getSystemStats() {
    return new Promise(async (resolve, reject) => {
        try {
            const startTime = Date.now();
            
            // Test database response time
            await new Promise((resolve) => {
                db.get('SELECT 1', resolve);
            });
            const db_response_time = Date.now() - startTime;
            
            // Get total record count across all tables
            const table_counts = await Promise.all([
                new Promise(resolve => db.get('SELECT COUNT(*) as count FROM users', (err, row) => resolve(row?.count || 0))),
                new Promise(resolve => db.get('SELECT COUNT(*) as count FROM goals', (err, row) => resolve(row?.count || 0))),
                new Promise(resolve => db.get('SELECT COUNT(*) as count FROM posts', (err, row) => resolve(row?.count || 0))),
                new Promise(resolve => db.get('SELECT COUNT(*) as count FROM comments', (err, row) => resolve(row?.count || 0))),
                new Promise(resolve => db.get('SELECT COUNT(*) as count FROM milestones', (err, row) => resolve(row?.count || 0))),
                new Promise(resolve => db.get('SELECT COUNT(*) as count FROM notifications', (err, row) => resolve(row?.count || 0)))
            ]);
            
            const total_records = table_counts.reduce((sum, count) => sum + count, 0);
            
            // Memory usage
            const memory = process.memoryUsage();
            const memory_usage_mb = (memory.heapUsed / 1024 / 1024).toFixed(1);
            const memory_total_mb = (memory.heapTotal / 1024 / 1024).toFixed(1);
            const memory_usage_percent = ((memory.heapUsed / memory.heapTotal) * 100).toFixed(1);
            
            // Server uptime
            const uptime_seconds = process.uptime();
            const uptime_hours = Math.floor(uptime_seconds / 3600);
            const uptime_days = Math.floor(uptime_hours / 24);
            
            // Calculate "online users" as users who've been active in last 24 hours
            const online_users = await new Promise((resolve, reject) => {
                db.get(`
                    SELECT COUNT(DISTINCT user_id) as count 
                    FROM (
                        SELECT user_id FROM goals WHERE datetime(created_at) >= datetime('now', '-1 day')
                        UNION
                        SELECT user_id FROM posts WHERE datetime(created_at) >= datetime('now', '-1 day')
                        UNION  
                        SELECT user_id FROM comments WHERE datetime(created_at) >= datetime('now', '-1 day')
                    )
                `, (err, row) => {
                    if (err) {
                        console.error('Error getting online users:', err);
                        resolve(0);
                    } else {
                        resolve(row?.count || 0);
                    }
                });
            });
            
            resolve({
                db_response_time: db_response_time,
                total_records: total_records,
                memory_usage_mb: memory_usage_mb,
                memory_total_mb: memory_total_mb,
                memory_usage_percent: memory_usage_percent,
                uptime_seconds: uptime_seconds,
                uptime_hours: uptime_hours,
                uptime_days: uptime_days,
                online_users: online_users,
                db_performance: db_response_time < 100 ? 'excellent' : db_response_time < 500 ? 'good' : 'needs_attention'
            });
        } catch (error) {
            console.error('Error in getSystemStats:', error);
            reject(error);
        }
    });
}

// Broadcast messaging route
router.post('/broadcast', async (req, res) => {
    try {
        const { recipients, subject, message, sendEmail, sendNotification } = req.body;
        
        // Get target users based on recipients filter
        let query = 'SELECT id, email, username FROM users WHERE 1=1';
        let params = [];
        
        if (recipients === 'premium') {
            query += ' AND subscription_plan IN (?, ?)';
            params.push('monthly', 'annual');
        } else if (recipients === 'free') {
            query += ' AND (subscription_plan IS NULL OR subscription_plan = ?)';
            params.push('free');
        } else if (recipients === 'inactive') {
            query += ' AND last_login < datetime("now", "-30 days")';
        }
        
        const users = await new Promise((resolve, reject) => {
            db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        let emailsSent = 0;
        let notificationsSent = 0;
        
        // Send emails if requested
        if (sendEmail && users.length > 0) {
            // In a real implementation, you'd use a proper email service
            // For now, we'll just simulate the sending
            emailsSent = users.length;
            console.log(`Would send email to ${users.length} users: ${subject}`);
        }
        
        // Send in-app notifications if requested
        if (sendNotification && users.length > 0) {
            // Insert notifications into database
            const notificationPromises = users.map(user => {
                return new Promise((resolve, reject) => {
                    // Assuming you have a notifications table
                    db.run(`
                        INSERT INTO notifications (user_id, type, title, message, created_at)
                        VALUES (?, ?, ?, ?, datetime('now'))
                    `, [user.id, 'admin', subject, message], (err) => {
                        if (err) {
                            console.error('Error creating notification:', err);
                            resolve(); // Don't fail the whole operation
                        } else {
                            resolve();
                        }
                    });
                });
            });
            
            await Promise.all(notificationPromises);
            notificationsSent = users.length;
        }
        
        res.json({ 
            success: true, 
            emailsSent,
            notificationsSent,
            totalUsers: users.length
        });
    } catch (error) {
        console.error('Error sending broadcast:', error);
        res.status(500).json({ error: 'Failed to send broadcast' });
    }
});

// Analytics export route
router.get('/analytics/export', async (req, res) => {
    try {
        const [userCount, goalCount, postCount, premiumCount] = await Promise.all([
            getUserCount(),
            getGoalCount(),
            getPostCount(),
            getPremiumUserCount()
        ]);
        
        // Get additional analytics data
        const userGrowth = await new Promise((resolve, reject) => {
            db.all(`
                SELECT DATE(created_at) as date, COUNT(*) as count
                FROM users
                WHERE created_at >= datetime('now', '-30 days')
                GROUP BY DATE(created_at)
                ORDER BY date DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        const goalsByCategory = await new Promise((resolve, reject) => {
            db.all(`
                SELECT category, COUNT(*) as count
                FROM goals
                GROUP BY category
                ORDER BY count DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // Create CSV data
        const csvData = [
            ['Metric', 'Value'],
            ['Total Users', userCount],
            ['Total Goals', goalCount],
            ['Community Posts', postCount],
            ['Premium Users', premiumCount],
            ['Conversion Rate', `${((premiumCount / userCount) * 100).toFixed(2)}%`],
            [''],
            ['Recent User Growth (Last 30 Days)'],
            ['Date', 'New Users']
        ];
        
        userGrowth.forEach(day => {
            csvData.push([day.date, day.count]);
        });
        
        csvData.push(['']);
        csvData.push(['Goals by Category']);
        csvData.push(['Category', 'Count']);
        
        goalsByCategory.forEach(category => {
            csvData.push([category.category || 'Uncategorized', category.count]);
        });
        
        const csv = csvData.map(row => row.join(',')).join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=admin-analytics-${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Error exporting analytics:', error);
        res.status(500).json({ error: 'Failed to export analytics' });
    }
});

// System monitoring API
router.get('/system/status', async (req, res) => {
    try {
        // Get system metrics
        const dbSize = await new Promise((resolve, reject) => {
            // This is a simple way to estimate database size
            db.all(`
                SELECT name, COUNT(*) as count FROM sqlite_master 
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
            `, (err, tables) => {
                if (err) reject(err);
                else {
                    // Get total record count across all tables
                    let totalRecords = 0;
                    Promise.all(tables.map(table => {
                        return new Promise((resolve, reject) => {
                            db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, row) => {
                                if (err) resolve(0);
                                else resolve(row.count);
                            });
                        });
                    })).then(counts => {
                        totalRecords = counts.reduce((sum, count) => sum + count, 0);
                        resolve(totalRecords);
                    });
                }
            });
        });
        
        const onlineUsers = Math.floor(Math.random() * 50) + 10; // Simulate online users
        const serverLoad = Math.floor(Math.random() * 40) + 30; // Simulate server load
        
        res.json({
            status: 'operational',
            onlineUsers,
            serverLoad,
            databaseRecords: dbSize,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error getting system status:', error);
        res.status(500).json({ error: 'Failed to get system status' });
    }
});

// IP tracking test endpoint
router.get('/test/ip-tracking', async (req, res) => {
    try {
        // Get recent IP tracking activity
        const recentActivity = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    COUNT(*) as total_tracked_ips,
                    COUNT(CASE WHEN DATE(first_visit) = DATE('now') THEN 1 END) as new_today,
                    COUNT(CASE WHEN DATE(last_visit) >= DATE('now', '-1 hour') THEN 1 END) as active_last_hour,
                    MAX(last_visit) as most_recent_visit
                FROM ip_visits
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows[0]);
            });
        });

        // Get latest IP entries
        const latestIPs = await new Promise((resolve, reject) => {
            db.all(`
                SELECT ip_address, visit_count, last_visit, page_path
                FROM ip_visits 
                ORDER BY last_visit DESC 
                LIMIT 5
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const isWorking = recentActivity.total_tracked_ips > 0;
        
        res.json({
            status: isWorking ? 'working' : 'no_data',
            message: isWorking ? 'IP tracking is active and collecting data' : 'No IP data found - tracking may not be working',
            data: {
                total_tracked_ips: recentActivity.total_tracked_ips || 0,
                new_today: recentActivity.new_today || 0,
                active_last_hour: recentActivity.active_last_hour || 0,
                most_recent_visit: recentActivity.most_recent_visit || null,
                latest_ips: latestIPs || []
            },
            privacy_note: 'IPs are anonymized by removing the last octet for privacy compliance',
            compliance: {
                anonymized: true,
                retention_days: 90,
                excludes_bots: true,
                excludes_admin: true
            }
        });
    } catch (error) {
        console.error('Error testing IP tracking:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Failed to test IP tracking',
            error: error.message 
        });
    }
});

// User analytics API
router.get('/analytics/users', async (req, res) => {
    try {
        const range = req.query.range || 'month'; // day, week, month, year
        
        let dateFilter = '';
        switch (range) {
            case 'day':
                dateFilter = "datetime('now', '-1 day')";
                break;
            case 'week':
                dateFilter = "datetime('now', '-7 days')";
                break;
            case 'year':
                dateFilter = "datetime('now', '-1 year')";
                break;
            default: // month
                dateFilter = "datetime('now', '-30 days')";
        }
        
        const userGrowth = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as new_users,
                    (SELECT COUNT(*) FROM users u2 WHERE u2.created_at <= u.created_at) as total_users
                FROM users u
                WHERE created_at >= ${dateFilter}
                GROUP BY DATE(created_at)
                ORDER BY date ASC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        const subscriptionData = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    subscription_plan,
                    COUNT(*) as count
                FROM users
                WHERE subscription_plan IS NOT NULL
                GROUP BY subscription_plan
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        res.json({
            userGrowth,
            subscriptionData,
            range
        });
    } catch (error) {
        console.error('Error getting user analytics:', error);
        res.status(500).json({ error: 'Failed to get user analytics' });
    }
});

// Real-time analytics API endpoints
router.get('/analytics/realtime/users', async (req, res) => {
    try {
        const range = req.query.range || 'today';
        let dateFilter, groupBy;
        
        switch (range) {
            case 'today':
                dateFilter = "datetime('now', '-24 hours')";
                groupBy = "strftime('%H', created_at)";
                break;
            case 'week':
                dateFilter = "datetime('now', '-7 days')";
                groupBy = "DATE(created_at)";
                break;
            case 'month':
                dateFilter = "datetime('now', '-30 days')";
                groupBy = "DATE(created_at)";
                break;
            default:
                dateFilter = "datetime('now', '-24 hours')";
                groupBy = "strftime('%H', created_at)";
        }
        
        const userGrowthData = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    ${groupBy} as period,
                    COUNT(*) as new_users,
                    (SELECT COUNT(*) FROM users WHERE created_at <= u.created_at) as total_users
                FROM users u
                WHERE created_at >= ${dateFilter}
                GROUP BY ${groupBy}
                ORDER BY period ASC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        // Get active users (users with recent activity)
        const activeUsersData = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    ${groupBy} as period,
                    COUNT(DISTINCT user_id) as active_users
                FROM (
                    SELECT user_id, created_at FROM goals WHERE created_at >= ${dateFilter}
                    UNION ALL
                    SELECT user_id, created_at FROM posts WHERE created_at >= ${dateFilter}
                    UNION ALL
                    SELECT user_id, created_at FROM comments WHERE created_at >= ${dateFilter}
                ) activity
                GROUP BY ${groupBy}
                ORDER BY period ASC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        res.json({
            userGrowth: userGrowthData,
            activeUsers: activeUsersData,
            range: range
        });
    } catch (error) {
        console.error('Error getting real-time user analytics:', error);
        res.status(500).json({ error: 'Failed to get user analytics' });
    }
});

router.get('/analytics/realtime/revenue', async (req, res) => {
    try {
        const range = req.query.range || 'today';
        let dateFilter, groupBy;
        
        switch (range) {
            case 'today':
                dateFilter = "datetime('now', '-24 hours')";
                groupBy = "strftime('%H', subscription_start)";
                break;
            case 'week':
                dateFilter = "datetime('now', '-7 days')";
                groupBy = "DATE(subscription_start)";
                break;
            case 'month':
                dateFilter = "datetime('now', '-30 days')";
                groupBy = "DATE(subscription_start)";
                break;
            default:
                dateFilter = "datetime('now', '-24 hours')";
                groupBy = "strftime('%H', subscription_start)";
        }
        
        const revenueData = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    ${groupBy} as period,
                    COUNT(CASE WHEN subscription_plan = 'monthly' THEN 1 END) as monthly_subs,
                    COUNT(CASE WHEN subscription_plan = 'annual' THEN 1 END) as annual_subs,
                    (COUNT(CASE WHEN subscription_plan = 'monthly' THEN 1 END) * 12.99 +
                     COUNT(CASE WHEN subscription_plan = 'annual' THEN 1 END) * 119.19) as period_revenue
                FROM users
                WHERE subscription_start >= ${dateFilter}
                  AND subscription_plan IN ('monthly', 'annual')
                GROUP BY ${groupBy}
                ORDER BY period ASC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        res.json({
            revenueData: revenueData,
            range: range
        });
    } catch (error) {
        console.error('Error getting real-time revenue analytics:', error);
        res.status(500).json({ error: 'Failed to get revenue analytics' });
    }
});

router.get('/analytics/realtime/engagement', async (req, res) => {
    try {
        const range = req.query.range || 'today';
        let dateFilter;
        
        switch (range) {
            case 'today':
                dateFilter = "datetime('now', '-24 hours')";
                break;
            case 'week':
                dateFilter = "datetime('now', '-7 days')";
                break;
            case 'month':
                dateFilter = "datetime('now', '-30 days')";
                break;
            default:
                dateFilter = "datetime('now', '-24 hours')";
        }
        
        const engagementData = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    (SELECT COUNT(*) FROM goals WHERE created_at >= ${dateFilter}) as goals_created,
                    (SELECT COUNT(*) FROM posts WHERE created_at >= ${dateFilter}) as posts_shared,
                    (SELECT COUNT(*) FROM comments WHERE created_at >= ${dateFilter}) as comments_made,
                    (SELECT COUNT(*) FROM goals WHERE status = 'completed' AND updated_at >= ${dateFilter}) as goals_completed,
                    (SELECT COUNT(*) FROM post_likes WHERE created_at >= ${dateFilter}) as likes_given
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows[0]);
            });
        });
        
        // Get engagement over time
        const timelineData = await new Promise((resolve, reject) => {
            const groupBy = range === 'today' ? "strftime('%H', created_at)" : "DATE(created_at)";
            
            db.all(`
                SELECT 
                    ${groupBy} as period,
                    (SELECT COUNT(*) FROM goals WHERE created_at >= ${dateFilter} AND ${groupBy} = period) as goals,
                    (SELECT COUNT(*) FROM posts WHERE created_at >= ${dateFilter} AND ${groupBy} = period) as posts,
                    (SELECT COUNT(*) FROM comments WHERE created_at >= ${dateFilter} AND ${groupBy} = period) as comments
                FROM (
                    SELECT DISTINCT ${groupBy} as period FROM goals WHERE created_at >= ${dateFilter}
                    UNION
                    SELECT DISTINCT ${groupBy} as period FROM posts WHERE created_at >= ${dateFilter}
                    UNION
                    SELECT DISTINCT ${groupBy} as period FROM comments WHERE created_at >= ${dateFilter}
                ) periods
                ORDER BY period ASC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        res.json({
            summary: engagementData,
            timeline: timelineData,
            range: range
        });
    } catch (error) {
        console.error('Error getting real-time engagement analytics:', error);
        res.status(500).json({ error: 'Failed to get engagement analytics' });
    }
});

async function deleteUserRecords(userId) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Get all user's goals
            db.all('SELECT id FROM goals WHERE user_id = ?', [userId], (err, goals) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const goalIds = goals.map(goal => goal.id);
                
                // Transaction to delete everything
                db.run('BEGIN TRANSACTION', (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    // If user has goals, delete related records
                    if (goalIds.length > 0) {
                        const placeholders = goalIds.map(() => '?').join(',');
                        
                        // Delete milestones
                        db.run(`DELETE FROM milestones WHERE goal_id IN (${placeholders})`, goalIds, (err) => {
                            if (err) console.error('Error deleting milestones:', err);
                        });
                        
                        // Delete goal logs
                        db.run(`DELETE FROM goal_logs WHERE goal_id IN (${placeholders})`, goalIds, (err) => {
                            if (err) console.error('Error deleting goal logs:', err);
                        });
                        
                        // Delete goal notes
                        db.run(`DELETE FROM goal_notes WHERE goal_id IN (${placeholders})`, goalIds, (err) => {
                            if (err) console.error('Error deleting goal notes:', err);
                        });
                        
                        // Delete motivation items
                        db.run(`DELETE FROM motivation_items WHERE goal_id IN (${placeholders})`, goalIds, (err) => {
                            if (err) console.error('Error deleting motivation items:', err);
                        });
                    }
                    
                    // Delete all comments by this user
                    db.run('DELETE FROM comments WHERE user_id = ?', [userId], (err) => {
                        if (err) console.error('Error deleting user comments:', err);
                    });
                    
                    // Delete all post likes by this user
                    db.run('DELETE FROM post_likes WHERE user_id = ?', [userId], (err) => {
                        if (err) console.error('Error deleting user post likes:', err);
                    });
                    
                    // Delete all user's posts and associated comments/likes
                    db.all('SELECT id FROM posts WHERE user_id = ?', [userId], (err, posts) => {
                        if (err) {
                            console.error('Error getting user posts:', err);
                        } else if (posts.length > 0) {
                            const postIds = posts.map(post => post.id);
                            const postPlaceholders = postIds.map(() => '?').join(',');
                            
                            // Delete comments on user's posts
                            db.run(`DELETE FROM comments WHERE post_id IN (${postPlaceholders})`, postIds, (err) => {
                                if (err) console.error('Error deleting post comments:', err);
                            });
                            
                            // Delete likes on user's posts
                            db.run(`DELETE FROM post_likes WHERE post_id IN (${postPlaceholders})`, postIds, (err) => {
                                if (err) console.error('Error deleting post likes:', err);
                            });
                        }
                        
                        // Delete user's posts
                        db.run('DELETE FROM posts WHERE user_id = ?', [userId], (err) => {
                            if (err) console.error('Error deleting user posts:', err);
                        });
                        
                        // Delete user's goals
                        db.run('DELETE FROM goals WHERE user_id = ?', [userId], (err) => {
                            if (err) console.error('Error deleting user goals:', err);
                        });
                        
                        // Finally, delete the user
                        db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
                            if (err) {
                                db.run('ROLLBACK', () => reject(err));
                            } else {
                                db.run('COMMIT', (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                });
                            }
                        });
                    });
                });
            });
        });
    });
}

// ============================================================================
// ADSENSE ANALYTICS ROUTES
// ============================================================================

// AdSense Analytics Dashboard
router.get('/adsense', async (req, res) => {
    try {
        res.render('admin/adsense', {
            title: 'AdSense Analytics - Admin Dashboard',
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading AdSense analytics:', error);
        res.status(500).render('error', {
            title: 'Error - Goal Tracker',
            error: 'Failed to load AdSense analytics'
        });
    }
});

// ============================================================================
// OLD AD MANAGEMENT ROUTES (DEPRECATED - Replaced by automatic AdSense)
// ============================================================================

// Ads management dashboard (DEPRECATED)
router.get('/ads', async (req, res) => {
    try {
        // Get all ads with performance data
        const ads = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    a.*,
                    COUNT(ap.id) as total_clicks,
                    COUNT(CASE WHEN ap.action_type = 'impression' THEN 1 END) as total_impressions,
                    SUM(ap.revenue_generated) as total_revenue,
                    COUNT(CASE WHEN DATE(ap.created_at) = DATE('now') THEN 1 END) as clicks_today,
                    COUNT(CASE WHEN ap.action_type = 'impression' AND DATE(ap.created_at) = DATE('now') THEN 1 END) as impressions_today
                FROM ads a
                LEFT JOIN ad_performance ap ON a.id = ap.ad_id
                GROUP BY a.id
                ORDER BY a.display_order ASC, a.created_at DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get ad statistics
        const adStats = await new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    COUNT(*) as total_ads,
                    COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_ads,
                    COUNT(CASE WHEN ad_type = 'external' THEN 1 END) as external_ads,
                    SUM(current_daily_spend) as total_daily_spend
                FROM ads
            `, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        res.render('admin/ads', {
            title: 'Ad Management - Admin Dashboard',
            ads,
            adStats,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading ads management:', error);
        res.status(500).render('error', {
            title: 'Error - Goal Tracker',
            error: 'Failed to load ads management'
        });
    }
});

// Create new ad
router.post('/ads', async (req, res) => {
    try {
        const {
            name, title, description, image_url, link_url, button_text,
            ad_type, placement, target_audience, start_date, end_date,
            display_order, click_tracking, external_tracking_code, external_script,
            revenue_per_click, revenue_per_impression, max_daily_budget
        } = req.body;

        const adId = await new Promise((resolve, reject) => {
            db.run(`INSERT INTO ads 
                (name, title, description, image_url, link_url, button_text, ad_type, 
                 placement, target_audience, start_date, end_date, display_order, 
                 click_tracking, external_tracking_code, external_script, 
                 revenue_per_click, revenue_per_impression, max_daily_budget, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [name, title, description, image_url, link_url, button_text, ad_type,
                 placement, target_audience, start_date, end_date, display_order,
                 click_tracking, external_tracking_code, external_script,
                 revenue_per_click, revenue_per_impression, max_daily_budget],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
        });

        res.json({ success: true, adId });
    } catch (error) {
        console.error('Error creating ad:', error);
        res.status(500).json({ error: 'Failed to create ad' });
    }
});

// Update ad
router.put('/ads/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, title, description, image_url, link_url, button_text,
            ad_type, placement, target_audience, start_date, end_date,
            display_order, click_tracking, external_tracking_code, external_script,
            revenue_per_click, revenue_per_impression, max_daily_budget, is_active
        } = req.body;

        await new Promise((resolve, reject) => {
            db.run(`UPDATE ads SET 
                name = ?, title = ?, description = ?, image_url = ?, link_url = ?, 
                button_text = ?, ad_type = ?, placement = ?, target_audience = ?, 
                start_date = ?, end_date = ?, display_order = ?, click_tracking = ?, 
                external_tracking_code = ?, external_script = ?, revenue_per_click = ?, 
                revenue_per_impression = ?, max_daily_budget = ?, is_active = ?, 
                updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
                [name, title, description, image_url, link_url, button_text, ad_type,
                 placement, target_audience, start_date, end_date, display_order,
                 click_tracking, external_tracking_code, external_script,
                 revenue_per_click, revenue_per_impression, max_daily_budget, is_active, id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                });
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating ad:', error);
        res.status(500).json({ error: 'Failed to update ad' });
    }
});

// Delete ad
router.delete('/ads/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Delete ad performance data first
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM ad_performance WHERE ad_id = ?', [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Delete the ad
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM ads WHERE id = ?', [id], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting ad:', error);
        res.status(500).json({ error: 'Failed to delete ad' });
    }
});

// Toggle ad status
router.post('/ads/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;

        // Get current status
        const ad = await new Promise((resolve, reject) => {
            db.get('SELECT is_active FROM ads WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!ad) {
            return res.status(404).json({ error: 'Ad not found' });
        }

        // Toggle status
        const newStatus = ad.is_active ? 0 : 1;
        await new Promise((resolve, reject) => {
            db.run('UPDATE ads SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
                [newStatus, id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true, is_active: newStatus });
    } catch (error) {
        console.error('Error toggling ad status:', error);
        res.status(500).json({ error: 'Failed to toggle ad status' });
    }
});

// Get ad performance analytics
router.get('/ads/:id/analytics', async (req, res) => {
    try {
        const { id } = req.params;
        const range = req.query.range || 'week'; // day, week, month, year

        let dateFilter;
        switch (range) {
            case 'day':
                dateFilter = "datetime('now', '-1 day')";
                break;
            case 'week':
                dateFilter = "datetime('now', '-7 days')";
                break;
            case 'month':
                dateFilter = "datetime('now', '-30 days')";
                break;
            case 'year':
                dateFilter = "datetime('now', '-1 year')";
                break;
            default:
                dateFilter = "datetime('now', '-7 days')";
        }

        const analytics = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    DATE(created_at) as date,
                    action_type,
                    COUNT(*) as count,
                    SUM(revenue_generated) as revenue
                FROM ad_performance 
                WHERE ad_id = ? AND created_at >= ${dateFilter}
                GROUP BY DATE(created_at), action_type
                ORDER BY date ASC
            `, [id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.json({ analytics, range });
    } catch (error) {
        console.error('Error getting ad analytics:', error);
        res.status(500).json({ error: 'Failed to get ad analytics' });
    }
});

// Reset daily ad spending
router.post('/ads/reset-daily-spend', async (req, res) => {
    try {
        await new Promise((resolve, reject) => {
            db.run('UPDATE ads SET current_daily_spend = 0', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        console.log('Admin reset daily ad spending for all ads');
        res.json({ success: true });
    } catch (error) {
        console.error('Error resetting daily spend:', error);
        res.status(500).json({ error: 'Failed to reset daily spending' });
    }
});

module.exports = router; 