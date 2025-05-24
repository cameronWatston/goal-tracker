const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db/init');
const { sendWelcomeEmail, sendVerificationEmail } = require('../utils/emailService');

// Generate a random verification code
const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
};

// Register route - Step 1: Initial registration
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Check if user already exists
        db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, email], async (err, user) => {
            if (err) {
                console.error('Database error:', err);
                return res.render('register', { 
                    title: 'Register - Goal Tracker',
                    error: 'Error creating account. Please try again.',
                    formData: req.body
                });
            }

            if (user) {
                // Check if username is taken
                if (user.username === username) {
                    return res.render('register', { 
                        title: 'Register - Goal Tracker',
                        error: 'Username already exists',
                        formData: { email }
                    });
                }
                
                // Check if email is taken
                if (user.email === email) {
                    // If email exists but user is not verified, redirect to verification
                    if (!user.is_verified) {
                        // Store user info for verification
                        req.session.pendingUser = {
                            id: user.id,
                            username: user.username,
                            email: user.email
                        };
                        
                        // Generate new verification code
                        const verificationCode = generateVerificationCode();
                        const verificationExpires = new Date();
                        verificationExpires.setMinutes(verificationExpires.getMinutes() + 30);
                        
                        // Update verification code in database
                        db.run('UPDATE users SET verification_code = ?, verification_expires = ? WHERE id = ?',
                            [verificationCode, verificationExpires.toISOString(), user.id],
                            async (updateErr) => {
                                if (updateErr) {
                                    console.error('Error updating verification code:', updateErr);
                                    return res.render('register', { 
                                        title: 'Register - Goal Tracker',
                                        error: 'Error with account verification. Please try again.',
                                        formData: req.body
                                    });
                                }
                                
                                // Send new verification email
                                try {
                                    await sendVerificationEmail({
                                        id: user.id,
                                        username: user.username,
                                        email: user.email
                                    }, verificationCode);
                                } catch (emailError) {
                                    console.error('Failed to send verification email:', emailError);
                                    // Continue even if email fails
                                }
                                
                                // Redirect to verification page with helpful message
                                return res.redirect('/verify-email?from=register');
                            }
                        );
                        return; // Exit early to prevent further execution
                    }
                    
                    // If email exists and is verified, show error
                    return res.render('register', { 
                        title: 'Register - Goal Tracker',
                        error: 'Email already registered. Try logging in instead.',
                        formData: { username }
                    });
                }
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Generate verification code
            const verificationCode = generateVerificationCode();
            
            // Set expiration time for verification code (30 minutes from now)
            const verificationExpires = new Date();
            verificationExpires.setMinutes(verificationExpires.getMinutes() + 30);
            
            // Create new user (unverified)
            db.run('INSERT INTO users (username, email, password, verification_code, verification_expires) VALUES (?, ?, ?, ?, ?)',
                [username, email, hashedPassword, verificationCode, verificationExpires.toISOString()],
                async function(err) {
                    if (err) {
                        console.error('Error creating user:', err);
                        return res.render('register', { 
                            title: 'Register - Goal Tracker',
                            error: 'Error creating account. Please try again.',
                            formData: req.body
                        });
                    }

                    const userId = this.lastID;
                    
                    // Store user info in session for verification step
                    req.session.pendingUser = {
                        id: userId,
                        username: username,
                        email: email
                    };
                    
                    // Send verification email
                    try {
                        await sendVerificationEmail({
                            id: userId,
                            username,
                            email
                        }, verificationCode);
                    } catch (emailError) {
                        console.error('Failed to send verification email:', emailError);
                        // Continue with registration process even if email fails
                    }

                    // Redirect to verification page
                    res.redirect('/verify-email');
                }
            );
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.render('register', { 
            title: 'Register - Goal Tracker',
            error: 'Error creating account. Please try again.',
            formData: req.body
        });
    }
});

// Email verification route
router.post('/verify', async (req, res) => {
    try {
        const { code } = req.body;
        const pendingUser = req.session.pendingUser;
        
        if (!pendingUser) {
            return res.redirect('/register');
        }
        
        // Check verification code
        db.get('SELECT * FROM users WHERE id = ? AND verification_code = ?', 
            [pendingUser.id, code], 
            async (err, user) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.render('verify-email', { 
                        title: 'Verify Email - Goal Tracker',
                        error: 'Error verifying email. Please try again.',
                        email: pendingUser.email
                    });
                }
                
                if (!user) {
                    return res.render('verify-email', { 
                        title: 'Verify Email - Goal Tracker',
                        error: 'Invalid verification code. Please try again.',
                        email: pendingUser.email
                    });
                }
                
                // Check if code is expired
                const now = new Date();
                const expires = new Date(user.verification_expires);
                
                if (now > expires) {
                    return res.render('verify-email', { 
                        title: 'Verify Email - Goal Tracker',
                        error: 'Verification code expired. Please request a new one.',
                        email: pendingUser.email
                    });
                }
                
                // Mark user as verified
                db.run('UPDATE users SET is_verified = 1, verification_code = NULL WHERE id = ?', [user.id], async (err) => {
                    if (err) {
                        console.error('Error updating user verification status:', err);
                        return res.render('verify-email', { 
                            title: 'Verify Email - Goal Tracker',
                            error: 'Error verifying email. Please try again.',
                            email: pendingUser.email
                        });
                    }
                    
                    // Set user session
                    req.session.user = {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        subscription_plan: user.subscription_plan || 'free',
                        subscription_id: user.subscription_id || null,
                        subscription_end: user.subscription_end || null,
                        is_admin: user.is_admin || 0
                    };
                    
                    // Clear pending user
                    delete req.session.pendingUser;
                    
                    // Send welcome email
                    try {
                        await sendWelcomeEmail({
                            id: user.id,
                            username: user.username,
                            email: user.email
                        });
                    } catch (emailError) {
                        console.error('Failed to send welcome email:', emailError);
                        // Continue with verification even if email fails
                    }
                    
                    // Track daily login achievements
                    try {
                        const AchievementTracker = require('../utils/achievements');
                        const StreakTracker = require('../utils/streak-tracker');
                        
                        // Record daily activity and get current streak
                        const currentStreak = await StreakTracker.recordDailyActivity(user.id, 'login');
                        
                        // Track achievements with the real streak
                        const unlockedAchievements = await AchievementTracker.trackDailyLogin(user.id);
                        
                        if (unlockedAchievements.length > 0) {
                            console.log(`🏆 User ${user.id} unlocked ${unlockedAchievements.length} achievements for daily login`);
                        }
                        
                        console.log(`🔥 User ${user.id} current streak: ${currentStreak} days`);
                    } catch (achievementError) {
                        console.error('Error tracking daily login achievements:', achievementError);
                        // Don't fail login if achievement tracking fails
                    }
                    
                    // Redirect to dashboard
                    res.redirect('/dashboard');
                });
            }
        );
    } catch (error) {
        console.error('Verification error:', error);
        res.render('verify-email', { 
            title: 'Verify Email - Goal Tracker',
            error: 'Error verifying email. Please try again.',
            email: req.session.pendingUser ? req.session.pendingUser.email : ''
        });
    }
});

// Resend verification code
router.post('/resend-verification', async (req, res) => {
    try {
        const pendingUser = req.session.pendingUser;
        
        if (!pendingUser) {
            return res.redirect('/register');
        }
        
        // Generate new verification code
        const verificationCode = generateVerificationCode();
        
        // Set new expiration time
        const verificationExpires = new Date();
        verificationExpires.setMinutes(verificationExpires.getMinutes() + 30);
        
        // Update verification code in database
        db.run('UPDATE users SET verification_code = ?, verification_expires = ? WHERE id = ?',
            [verificationCode, verificationExpires.toISOString(), pendingUser.id],
            async (err) => {
                if (err) {
                    console.error('Error updating verification code:', err);
                    return res.render('verify-email', { 
                        title: 'Verify Email - Goal Tracker',
                        error: 'Error sending new verification code. Please try again.',
                        email: pendingUser.email
                    });
                }
                
                // Send new verification email
                try {
                    await sendVerificationEmail({
                        id: pendingUser.id,
                        username: pendingUser.username,
                        email: pendingUser.email
                    }, verificationCode);
                    
                    return res.render('verify-email', { 
                        title: 'Verify Email - Goal Tracker',
                        success: 'A new verification code has been sent to your email.',
                        email: pendingUser.email
                    });
                } catch (emailError) {
                    console.error('Failed to send verification email:', emailError);
                    return res.render('verify-email', { 
                        title: 'Verify Email - Goal Tracker',
                        error: 'Error sending verification email. Please try again.',
                        email: pendingUser.email
                    });
                }
            }
        );
    } catch (error) {
        console.error('Resend verification error:', error);
        res.render('verify-email', { 
            title: 'Verify Email - Goal Tracker',
            error: 'Error sending new verification code. Please try again.',
            email: req.session.pendingUser ? req.session.pendingUser.email : ''
        });
    }
});

// Login route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user by email
        db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                console.error('Database error:', err);
                return res.render('login', { 
                    title: 'Login - Goal Tracker',
                    error: 'Error logging in. Please try again.',
                    formData: { email }
                });
            }

            if (!user) {
                // If not found by email, try finding by username
                db.get('SELECT * FROM users WHERE username = ?', [email], async (err, userByUsername) => {
                    if (err || !userByUsername) {
                        return res.render('login', { 
                            title: 'Login - Goal Tracker',
                            error: 'Invalid email or password',
                            formData: { email }
                        });
                    }
                    
                    // Use the user found by username
                    user = userByUsername;
                    
                    // Continue with password check and login logic
                    continueLoginProcess();
                });
            } else {
                // Continue with the user found by email
                continueLoginProcess();
            }
            
            // Helper function to continue the login process
            async function continueLoginProcess() {
                // Check password
                const isMatch = await bcrypt.compare(password, user.password);
                if (!isMatch) {
                    return res.render('login', { 
                        title: 'Login - Goal Tracker',
                        error: 'Invalid email or password',
                        formData: { email }
                    });
                }
                
                // Check if user is verified
                if (!user.is_verified) {
                    // Store user info for verification
                    req.session.pendingUser = {
                        id: user.id,
                        username: user.username,
                        email: user.email
                    };
                    
                    return res.redirect('/verify-email');
                }

                // Set session
                req.session.user = {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    subscription_plan: user.subscription_plan || 'free',
                    subscription_id: user.subscription_id || null,
                    subscription_end: user.subscription_end || null,
                    is_admin: user.is_admin || 0
                };

                // Track daily login achievements
                try {
                    const AchievementTracker = require('../utils/achievements');
                    const StreakTracker = require('../utils/streak-tracker');
                    
                    // Record daily activity and get current streak
                    const currentStreak = await StreakTracker.recordDailyActivity(user.id, 'login');
                    
                    // Track achievements with the real streak
                    const unlockedAchievements = await AchievementTracker.trackDailyLogin(user.id);
                    
                    if (unlockedAchievements.length > 0) {
                        console.log(`🏆 User ${user.id} unlocked ${unlockedAchievements.length} achievements for daily login`);
                    }
                    
                    console.log(`🔥 User ${user.id} current streak: ${currentStreak} days`);
                } catch (achievementError) {
                    console.error('Error tracking daily login achievements:', achievementError);
                    // Don't fail login if achievement tracking fails
                }

                res.redirect('/dashboard');
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', { 
            title: 'Login - Goal Tracker',
            error: 'Error logging in. Please try again.',
            formData: { email: req.body.email }
        });
    }
});

// Logout route
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ message: 'Error logging out' });
        }
        res.redirect('/');
    });
});

// Account deletion route
router.post('/delete-account', async (req, res) => {
    try {
        // Ensure user is logged in
        if (!req.session.user) {
            return res.redirect('/login');
        }
        
        const userId = req.session.user.id;
        
        // Delete user's milestones and goals first (due to foreign key constraints)
        db.serialize(() => {
            // 1. Get all user's goals
            db.all('SELECT id FROM goals WHERE user_id = ?', [userId], (err, goals) => {
                if (err) {
                    console.error('Error fetching goals for deletion:', err);
                    return res.status(500).render('error', { 
                        title: 'Error - Goal Tracker',
                        error: 'Failed to delete account. Please try again.'
                    });
                }
                
                // 2. Delete all milestones associated with those goals
                if (goals && goals.length > 0) {
                    const goalIds = goals.map(goal => goal.id);
                    
                    // Using placeholders for each ID
                    const placeholders = goalIds.map(() => '?').join(',');
                    
                    db.run(`DELETE FROM milestones WHERE goal_id IN (${placeholders})`, goalIds, (err) => {
                        if (err) {
                            console.error('Error deleting milestones:', err);
                        }
                    });
                }
                
                // 3. Delete all goals
                db.run('DELETE FROM goals WHERE user_id = ?', [userId], (err) => {
                    if (err) {
                        console.error('Error deleting goals:', err);
                    }
                    
                    // 4. Finally, delete the user
                    db.run('DELETE FROM users WHERE id = ?', [userId], (err) => {
                        if (err) {
                            console.error('Error deleting user:', err);
                            return res.status(500).render('error', { 
                                title: 'Error - Goal Tracker',
                                error: 'Failed to delete account. Please try again.'
                            });
                        }
                        
                        // 5. Destroy session
                        req.session.destroy((err) => {
                            if (err) {
                                console.error('Session destruction error:', err);
                            }
                            
                            // Redirect to home page with success message
                            res.redirect('/?message=account_deleted');
                        });
                    });
                });
            });
        });
    } catch (error) {
        console.error('Account deletion error:', error);
        res.status(500).render('error', { 
            title: 'Error - Goal Tracker',
            error: 'Failed to delete account. Please try again.'
        });
    }
});

// Profile page
router.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    res.render('profile', {
        title: 'Your Profile - Goal Tracker',
        user: req.session.user,
        success: req.query.success,
        error: req.query.error
    });
});

// Update profile
router.post('/profile/update', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const userId = req.session.user.id;
    const { username, email, currentPassword, newPassword, confirmPassword } = req.body;

    // First, check if username is being changed and if it's unique
    if (username !== req.session.user.username) {
        // Check if username is already taken
        const userWithUsername = await new Promise((resolve) => {
            db.get('SELECT * FROM users WHERE username = ? AND id != ?', [username, userId], (err, row) => {
                resolve(row);
            });
        });

        if (userWithUsername) {
            return res.render('profile', {
                title: 'Your Profile - Goal Tracker',
                user: req.session.user,
                error: 'Username already taken'
            });
        }
    }

    // Check if email is being changed and if it's unique
    if (email !== req.session.user.email) {
        // Check if email is already taken
        const userWithEmail = await new Promise((resolve) => {
            db.get('SELECT * FROM users WHERE email = ? AND id != ?', [email, userId], (err, row) => {
                resolve(row);
            });
        });

        if (userWithEmail) {
            return res.render('profile', {
                title: 'Your Profile - Goal Tracker',
                user: req.session.user,
                error: 'Email already taken'
            });
        }
    }

    // If password is being changed, verify current password and check new passwords match
    let passwordUpdate = '';
    let passwordParams = [];

    if (newPassword) {
        if (!currentPassword) {
            return res.render('profile', {
                title: 'Your Profile - Goal Tracker',
                user: req.session.user,
                error: 'Current password is required to set a new password'
            });
        }

        if (newPassword !== confirmPassword) {
            return res.render('profile', {
                title: 'Your Profile - Goal Tracker',
                user: req.session.user,
                error: 'New passwords do not match'
            });
        }

        // Verify current password
        const userRecord = await new Promise((resolve) => {
            db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
                resolve(row);
            });
        });

        const isMatch = await bcrypt.compare(currentPassword, userRecord.password);
        if (!isMatch) {
            return res.render('profile', {
                title: 'Your Profile - Goal Tracker',
                user: req.session.user,
                error: 'Current password is incorrect'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        passwordUpdate = ', password = ?';
        passwordParams = [hashedPassword];
    }

    // Update user in the database
    try {
        await new Promise((resolve, reject) => {
            const query = `UPDATE users SET username = ?, email = ?${passwordUpdate} WHERE id = ?`;
            const params = [username, email, ...passwordParams, userId];

            db.run(query, params, function(err) {
                if (err) {
                    console.error('Error updating user:', err);
                    reject(err);
                    return;
                }
                resolve();
            });
        });

        // Update session with new user data
        req.session.user = {
            ...req.session.user,
            username,
            email
        };

        // Track profile completion achievement
        try {
            const AchievementTracker = require('../utils/achievements');
            const unlockedAchievements = await AchievementTracker.trackProfileCompleted(userId);
            
            if (unlockedAchievements.length > 0) {
                console.log(`🏆 User ${userId} unlocked ${unlockedAchievements.length} achievements for completing profile`);
            }
        } catch (achievementError) {
            console.error('Error tracking profile completion achievement:', achievementError);
            // Don't fail the profile update if achievement tracking fails
        }

        return res.redirect('/profile?success=Profile+updated+successfully');
    } catch (error) {
        return res.render('profile', {
            title: 'Your Profile - Goal Tracker',
            user: req.session.user,
            error: 'Failed to update profile. Please try again.'
        });
    }
});

module.exports = router; 