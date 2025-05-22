const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { isAdmin } = require('../middleware/auth');
const stripeService = require('../utils/stripeService');

// Apply admin middleware to all routes
router.use(isAdmin);

// Admin dashboard
router.get('/', async (req, res) => {
    try {
        // Get counts for dashboard
        const [userCount, goalCount, postCount] = await Promise.all([
            getUserCount(),
            getGoalCount(),
            getPostCount()
        ]);
        
        // Get premium subscription counts
        const premiumCount = await getPremiumUserCount();
        
        // Get recent user signups
        const recentUsers = await getRecentUsers(5);
        
        res.render('admin/dashboard', {
            title: 'Admin Dashboard - Goal Tracker',
            userCount,
            goalCount,
            postCount,
            premiumCount,
            recentUsers,
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
        
        // Get users with pagination
        const users = await new Promise((resolve, reject) => {
            db.all(`
                SELECT id, username, email, created_at, subscription_plan, is_admin, is_verified
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

module.exports = router; 