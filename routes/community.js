const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const Goal = require('../models/Goal');
const db = require('../db/init');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Community home - show all posts
router.get('/', isAuthenticated, async (req, res) => {
    try {
        // Get community posts
        const posts = await new Promise((resolve, reject) => {
            Post.getAllPostsWithLikeStatus(req.session.user.id, (err, posts) => {
                if (err) reject(err);
                else resolve(posts || []);
            });
        });
        
        // Get real community stats
        const CommunityStats = require('../utils/community-stats');
        const [topContributors, communityOverview, trendingCategories] = await Promise.all([
            CommunityStats.getTopContributors(3),
            CommunityStats.getCommunityOverview(),
            CommunityStats.getTrendingCategories(5)
        ]);
        
        // If there are posts with goal_id, fetch basic goal information
        const postsWithGoalIds = posts.filter(post => post.goal_id);
        const goalIds = [...new Set(postsWithGoalIds.map(post => post.goal_id))];
        
        if (goalIds.length > 0) {
            // Create a promise for each goal
            const goalPromises = goalIds.map(goalId => {
                return new Promise((resolve, reject) => {
                    Goal.getGoalById(goalId, (err, goal) => {
                        if (err) {
                            console.error(`Error fetching goal ${goalId}:`, err);
                            resolve(null);
                        } else {
                            resolve({ id: goalId, data: goal });
                        }
                    });
                });
            });
            
            // Execute all promises
            try {
                const goalResults = await Promise.all(goalPromises);
                
                // Create a map of goal data by id
                const goalMap = {};
                goalResults.forEach(result => {
                    if (result && result.data) {
                        goalMap[result.id] = result.data;
                    }
                });
                
                // Attach goal data to posts
                posts.forEach(post => {
                    if (post.goal_id && goalMap[post.goal_id]) {
                        post.goalData = goalMap[post.goal_id];
                        post.canViewGoal = post.user_id === req.session.user.id || goalMap[post.goal_id].user_id === req.session.user.id;
                    }
                });
            } catch (goalError) {
                console.error('Error processing goals:', goalError);
            }
        }
        
        // Render with real community data
        res.render('community/index', {
            title: 'Community - Goal Tracker',
            posts,
            topContributors,
            communityOverview,
            trendingCategories,
            success: req.query.success,
            error: req.query.error
        });
        
    } catch (error) {
        console.error('Error loading community page:', error);
        res.status(500).render('error', {
            title: 'Error - Goal Tracker',
            error: 'Failed to load community page. Please try again.'
        });
    }
});

// My Posts page
router.get('/my-posts', isAuthenticated, (req, res) => {
    Post.getAllPostsWithLikeStatus(req.session.user.id, (err, allPosts) => {
        if (err) {
            console.error('Error fetching posts:', err);
            return res.status(500).render('error', {
                title: 'Error - Goal Tracker',
                error: 'Failed to load your posts. Please try again.'
            });
        }
        
        // Filter for only the user's posts
        const posts = allPosts.filter(post => post.user_id === req.session.user.id);
        
        // If there are posts with goal_id, fetch basic goal information
        const postsWithGoalIds = posts.filter(post => post.goal_id);
        const goalIds = [...new Set(postsWithGoalIds.map(post => post.goal_id))];
        
        if (goalIds.length > 0) {
            // Create a promise for each goal
            const goalPromises = goalIds.map(goalId => {
                return new Promise((resolve, reject) => {
                    Goal.getGoalById(goalId, (err, goal) => {
                        if (err) {
                            console.error(`Error fetching goal ${goalId}:`, err);
                            resolve(null); // Resolve with null to avoid breaking the promise chain
                        } else {
                            resolve({ id: goalId, data: goal });
                        }
                    });
                });
            });
            
            // Execute all promises
            Promise.all(goalPromises)
                .then(goalResults => {
                    // Create a map of goal data by id
                    const goalMap = {};
                    goalResults.forEach(result => {
                        if (result && result.data) {
                            goalMap[result.id] = result.data;
                        }
                    });
                    
                    // Attach goal data to posts
                    posts.forEach(post => {
                        if (post.goal_id && goalMap[post.goal_id]) {
                            post.goalData = goalMap[post.goal_id];
                            post.canViewGoal = true; // User can always view their own goals
                        }
                    });
                    
                    // Render with goal data
                    res.render('community/my-posts', {
                        title: 'My Posts - Goal Tracker',
                        posts,
                        success: req.query.success,
                        error: req.query.error
                    });
                })
                .catch(err => {
                    console.error('Error processing goals:', err);
                    // Render without goal data
                    res.render('community/my-posts', {
                        title: 'My Posts - Goal Tracker',
                        posts,
                        success: req.query.success,
                        error: req.query.error
                    });
                });
        } else {
            // No posts with goals, render without goal data
            res.render('community/my-posts', {
                title: 'My Posts - Goal Tracker',
                posts,
                success: req.query.success,
                error: req.query.error
            });
        }
    });
});

// Create post form
router.get('/create', isAuthenticated, (req, res) => {
    // Get user's goals for the dropdown
    Goal.getGoalsByUser(req.session.user.id, (err, goals) => {
        if (err) {
            console.error('Error fetching goals:', err);
            return res.render('community/create', {
                title: 'Create Post - Goal Tracker',
                goals: [],
                formData: req.body,
                error: 'Failed to load goals. You can still create a post without linking a goal.'
            });
        }
        
        res.render('community/create', {
            title: 'Create Post - Goal Tracker',
            goals,
            formData: {},
            error: null
        });
    });
});

// Create post submission
router.post('/create', isAuthenticated, (req, res) => {
    const { title, content, goalId } = req.body;
    const userId = req.session.user.id;
    
    // Validate input
    if (!title || !content) {
        return Goal.getGoalsByUser(req.session.user.id, (err, goals) => {
            res.render('community/create', {
                title: 'Create Post - Goal Tracker',
                goals: goals || [],
                formData: req.body,
                error: 'Please provide both title and content for your post.'
            });
        });
    }
    
    // Create the post
    Post.createPost(userId, title, content, goalId || null, async (err, postId) => {
        if (err) {
            console.error('Error creating post:', err);
            return Goal.getGoalsByUser(req.session.user.id, (err, goals) => {
                res.render('community/create', {
                    title: 'Create Post - Goal Tracker',
                    goals: goals || [],
                    formData: req.body,
                    error: 'Failed to create post. Please try again.'
                });
            });
        }
        
        // Track community post achievement
        try {
            const AchievementTracker = require('../utils/achievements');
            const unlockedAchievements = await AchievementTracker.trackCommunityActivity(userId, 'post');
            
            if (unlockedAchievements.length > 0) {
                console.log(`🏆 User ${userId} unlocked ${unlockedAchievements.length} achievements for community posting`);
            }
        } catch (achievementError) {
            console.error('Error tracking community post achievements:', achievementError);
            // Don't fail the post creation if achievement tracking fails
        }
        
        res.redirect('/community?success=Post+created+successfully');
    });
});

// View single post with comments
router.get('/post/:id', isAuthenticated, (req, res) => {
    const postId = req.params.id;
    const userId = req.session.user.id;
    
    Post.getPostWithCommentsAndLikeStatus(postId, userId, (err, post) => {
        if (err || !post) {
            console.error('Error fetching post:', err);
            return res.status(404).render('error', {
                title: 'Not Found - Goal Tracker',
                error: 'The post you are looking for does not exist.'
            });
        }
        
        // If post has a linked goal, fetch basic goal info
        if (post.goal_id) {
            Goal.getGoalById(post.goal_id, (err, goalData) => {
                if (err) {
                    console.error('Error fetching goal data:', err);
                    // Continue without goal data
                    return res.render('community/post-detail', {
                        title: `${post.title} - Goal Tracker`,
                        post,
                        goalData: null,
                        canViewGoal: false,
                        success: req.query.success,
                        error: req.query.error
                    });
                }
                
                // Determine if the current user can view full goal details
                const canViewGoal = goalData && goalData.user_id === userId;
                
                res.render('community/post-detail', {
                    title: `${post.title} - Goal Tracker`,
                    post,
                    goalData,
                    canViewGoal,
                    success: req.query.success,
                    error: req.query.error
                });
            });
        } else {
            // No linked goal, render without goal data
            res.render('community/post-detail', {
                title: `${post.title} - Goal Tracker`,
                post,
                goalData: null,
                canViewGoal: false,
                success: req.query.success,
                error: req.query.error
            });
        }
    });
});

// Add comment to post
router.post('/post/:id/comment', isAuthenticated, (req, res) => {
    const postId = req.params.id;
    const userId = req.session.user.id;
    const { content } = req.body;
    
    // Validate input
    if (!content) {
        return res.redirect(`/community/post/${postId}?error=Comment+cannot+be+empty`);
    }
    
    // Add the comment
    Post.addComment(postId, userId, content, async (err) => {
        if (err) {
            console.error('Error adding comment:', err);
            return res.redirect(`/community/post/${postId}?error=Failed+to+add+comment`);
        }
        
        // Track community comment achievement
        try {
            const AchievementTracker = require('../utils/achievements');
            const unlockedAchievements = await AchievementTracker.trackCommunityActivity(userId, 'comment');
            
            if (unlockedAchievements.length > 0) {
                console.log(`🏆 User ${userId} unlocked ${unlockedAchievements.length} achievements for community commenting`);
            }
        } catch (achievementError) {
            console.error('Error tracking community comment achievements:', achievementError);
            // Don't fail the comment if achievement tracking fails
        }

        // Get post info to create notification
        db.get('SELECT posts.*, users.username FROM posts JOIN users ON posts.user_id = users.id WHERE posts.id = ?', [postId], (err, postInfo) => {
            if (!err && postInfo && postInfo.user_id !== userId) {
                // Create notification for post author (don't notify yourself)
                db.run(
                    'INSERT INTO notifications (user_id, type, title, message, icon, action_url) VALUES (?, ?, ?, ?, ?, ?)',
                    [
                        postInfo.user_id,
                        'comment',
                        'New comment on your post! 💬',
                        `${req.session.user.username} commented on your post "${postInfo.title}"`,
                        '💬',
                        `/community/post/${postId}`
                    ],
                    (err) => {
                        if (err) console.error('Error creating comment notification:', err);
                    }
                );
            }
        });
        
        res.redirect(`/community/post/${postId}?success=Comment+added`);
    });
});

// Like a post
router.post('/post/:id/like', isAuthenticated, (req, res) => {
    const postId = req.params.id;
    const userId = req.session.user.id;
    
    // Check if post is already liked
    Post.checkUserLike(postId, userId, (err, isLiked) => {
        if (err) {
            console.error('Error checking like status:', err);
            return res.status(500).json({ success: false, message: 'Failed to check like status' });
        }
        
        if (isLiked) {
            // Unlike the post
            Post.unlikePost(postId, userId, (err) => {
                if (err) {
                    console.error('Error unliking post:', err);
                    return res.status(500).json({ success: false, message: 'Failed to unlike post' });
                }
                
                // Get updated like count
                db.get('SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?', [postId], (err, result) => {
                    if (err) {
                        console.error('Error getting like count:', err);
                        return res.json({ success: true, liked: false, likeCount: 0 });
                    }
                    
                    res.json({ success: true, liked: false, likeCount: result.count });
                });
            });
        } else {
            // Like the post
            Post.likePost(postId, userId, (err) => {
                if (err) {
                    console.error('Error liking post:', err);
                    return res.status(500).json({ success: false, message: 'Failed to like post' });
                }
                
                // Get post info to create notification
                db.get('SELECT posts.*, users.username FROM posts JOIN users ON posts.user_id = users.id WHERE posts.id = ?', [postId], (err, postInfo) => {
                    if (!err && postInfo && postInfo.user_id !== userId) {
                        // Create notification for post author (don't notify yourself)
                        db.run(
                            'INSERT INTO notifications (user_id, type, title, message, icon, action_url) VALUES (?, ?, ?, ?, ?, ?)',
                            [
                                postInfo.user_id,
                                'like',
                                'Someone liked your post! ❤️',
                                `${req.session.user.username} liked your post "${postInfo.title}"`,
                                '❤️',
                                `/community/post/${postId}`
                            ],
                            (err) => {
                                if (err) console.error('Error creating like notification:', err);
                            }
                        );
                    }
                    
                    // Get updated like count
                    db.get('SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?', [postId], (err, result) => {
                        if (err) {
                            console.error('Error getting like count:', err);
                            return res.json({ success: true, liked: true, likeCount: 1 });
                        }
                        
                        res.json({ success: true, liked: true, likeCount: result.count });
                    });
                });
            });
        }
    });
});

// Unlike a post (keeping for backward compatibility)
router.post('/post/:id/unlike', isAuthenticated, (req, res) => {
    const postId = req.params.id;
    const userId = req.session.user.id;
    
    Post.unlikePost(postId, userId, (err) => {
        if (err) {
            console.error('Error unliking post:', err);
            return res.status(500).json({ success: false, message: 'Failed to unlike post' });
        }
        
        // Get updated like count
        db.get('SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?', [postId], (err, result) => {
            if (err) {
                console.error('Error getting like count:', err);
                return res.json({ success: true, liked: false, likeCount: 0 });
            }
            
            res.json({ success: true, liked: false, likeCount: result.count });
        });
    });
});

// Edit post form
router.get('/post/:id/edit', isAuthenticated, (req, res) => {
    const postId = req.params.id;
    
    // Verify post exists and belongs to user
    Post.getPostWithComments(postId, (err, post) => {
        if (err || !post) {
            console.error('Error fetching post:', err);
            return res.status(404).render('error', {
                title: 'Not Found - Goal Tracker',
                error: 'The post you are looking for does not exist.'
            });
        }
        
        // Check if user is author
        if (post.user_id !== req.session.user.id) {
            return res.status(403).render('error', {
                title: 'Access Denied - Goal Tracker',
                error: 'You do not have permission to edit this post.'
            });
        }
        
        // Get user's goals for the dropdown
        Goal.getGoalsByUser(req.session.user.id, (err, goals) => {
            res.render('community/edit', {
                title: 'Edit Post - Goal Tracker',
                post,
                goals: goals || [],
                error: null
            });
        });
    });
});

// Update post
router.post('/post/:id/edit', isAuthenticated, (req, res) => {
    const postId = req.params.id;
    const { title, content } = req.body;
    
    // Verify post belongs to user
    Post.getPostWithComments(postId, (err, post) => {
        if (err || !post) {
            return res.status(404).render('error', {
                title: 'Not Found - Goal Tracker',
                error: 'The post you are looking for does not exist.'
            });
        }
        
        // Check if user is author
        if (post.user_id !== req.session.user.id) {
            return res.status(403).render('error', {
                title: 'Access Denied - Goal Tracker',
                error: 'You do not have permission to edit this post.'
            });
        }
        
        // Validate input
        if (!title || !content) {
            return Goal.getGoalsByUser(req.session.user.id, (err, goals) => {
                res.render('community/edit', {
                    title: 'Edit Post - Goal Tracker',
                    post: { ...post, title, content },
                    goals: goals || [],
                    error: 'Please provide both title and content for your post.'
                });
            });
        }
        
        // Update the post
        Post.updatePost(postId, title, content, (err) => {
            if (err) {
                console.error('Error updating post:', err);
                return res.redirect(`/community/post/${postId}/edit?error=Failed+to+update+post`);
            }
            
            res.redirect(`/community/post/${postId}?success=Post+updated+successfully`);
        });
    });
});

// Delete post
router.post('/post/:id/delete', isAuthenticated, (req, res) => {
    const postId = req.params.id;
    
    // Verify post belongs to user
    Post.getPostWithComments(postId, (err, post) => {
        if (err || !post) {
            return res.status(404).render('error', {
                title: 'Not Found - Goal Tracker',
                error: 'The post you are looking for does not exist.'
            });
        }
        
        // Check if user is author
        if (post.user_id !== req.session.user.id) {
            return res.status(403).render('error', {
                title: 'Access Denied - Goal Tracker',
                error: 'You do not have permission to delete this post.'
            });
        }
        
        // Delete the post
        Post.deletePost(postId, (err) => {
            if (err) {
                console.error('Error deleting post:', err);
                return res.redirect(`/community/post/${postId}?error=Failed+to+delete+post`);
            }
            
            res.redirect('/community/my-posts?success=Post+deleted+successfully');
        });
    });
});

module.exports = router; 