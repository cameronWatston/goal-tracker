const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const dotenv = require('dotenv');
const { loadEnvVariables } = require('./utils/envLoader');
const helmet = require('helmet');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Load environment variables
console.log('====== Starting Goal Tracker Application ======');
loadEnvVariables();

// Initialize database configuration (supports persistent disk)
const dbConfig = require('./config/database-config');
dbConfig.logConfig();

// Check if database exists and conditionally initialize
const dbPath = dbConfig.getDatabasePath();
const dbExists = fs.existsSync(dbPath);

if (!dbExists) {
    console.log('Database does not exist, initializing for first time...');
    // Initialize database for first time
    require('./db/init');
} else {
    console.log('Database exists, skipping recreation (prevents data loss on deploys)');
    // Just verify connection without recreating tables
    const testDb = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Error connecting to existing database:', err);
            console.log('Attempting to reinitialize database...');
            require('./db/init');
        } else {
            console.log('✅ Successfully connected to existing SQLite database');
        }
        testDb.close();
    });
}

const app = express();

// Security middleware
if (process.env.NODE_ENV === 'production') {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://js.stripe.com"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
                imgSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'self'", "https://js.stripe.com"],
            },
        },
    }));
}

// IP tracking middleware for analytics (before other middleware)
const { trackIP } = require('./middleware/ipTracking');
app.use(trackIP);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Explicit route for ads.txt (ensures AdSense can always find it)
app.get('/ads.txt', (req, res) => {
    res.type('text/plain');
    res.send('google.com, pub-1114938538633285, DIRECT, f08c47fec0942fa0');
});

// Session configuration
const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;

app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore({
        db: dbConfig.getSessionDatabase(),
        dir: dbConfig.getSessionPath()
    }),
    cookie: {
        maxAge: ONE_WEEK, // 1 week
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Set view engine and layout
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.set("layout extractScripts", true);
app.set("layout extractStyles", true);

// Import subscription, SEO, and automatic AdSense middleware
const { checkSubscriptionStatus } = require('./middleware/subscription');
const { loadSeoSettings } = require('./middleware/seo');
const { loadAutoAdsense } = require('./middleware/adsense');

// Make user data available to all views and check subscription status
app.use(checkSubscriptionStatus);
app.use(loadSeoSettings); // Load dynamic SEO settings
app.use(loadAutoAdsense); // Load automatic AdSense for free users
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || null;
    next();
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Routes
app.get('/', (req, res) => {
    res.render('home', { 
        title: 'Goal Tracker - Achieve More with AI',
        description: 'Transform your dreams into reality with our AI-powered goal tracking platform. Join 25,000+ users achieving their biggest goals.',
        canonicalUrl: 'https://goaltracker.com',
        error: req.query.error || null,
        success: req.query.success || null,
        formData: {}
    });
});

// Contact page
app.get('/contact', (req, res) => {
    res.render('contact', { 
        title: 'Contact Us - Goal Tracker',
        description: 'Get in touch with the Goal Tracker team. We\'re here to help you achieve your goals.',
        canonicalUrl: 'https://goaltracker.com/contact',
        error: null,
        success: null,
        formData: {}
    });
});

// Terms of Service page
app.get('/terms', (req, res) => {
    res.render('terms-of-service', { 
        title: 'Terms of Service - Goal Tracker',
        description: 'Read our Terms of Service to understand your rights and responsibilities when using Goal Tracker.',
        canonicalUrl: 'https://goaltracker.com/terms'
    });
});

// Privacy Policy page
app.get('/privacy', (req, res) => {
    res.render('privacy-policy', { 
        title: 'Privacy Policy - Goal Tracker',
        description: 'Learn how Goal Tracker protects your privacy and handles your personal data.',
        canonicalUrl: 'https://goaltracker.com/privacy'
    });
});

// Friends page
app.get('/friends', isAuthenticated, (req, res) => {
    res.render('friends', { 
        title: 'Friends - Goal Tracker',
        description: 'Connect with fellow goal achievers and build your support network.',
        canonicalUrl: 'https://goaltracker.com/friends',
        user: req.session.user
    });
});

// Messages page
app.get('/messages', isAuthenticated, (req, res) => {
    res.render('messages', { 
        title: 'Messages - Goal Tracker',
        description: 'Stay connected with your friends and support network through private messaging.',
        canonicalUrl: 'https://goaltracker.com/messages',
        user: req.session.user
    });
});

// Handle contact form submission
app.post('/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        const isFromHomePage = req.get('Referer') && req.get('Referer').includes('/#contact');
        
        // Validate required fields
        if (!name || !email || !subject || !message) {
            if (isFromHomePage) {
                return res.redirect('/?error=' + encodeURIComponent('Please fill in all required fields.'));
            }
            return res.render('contact', {
                title: 'Contact Us - Goal Tracker',
                description: 'Get in touch with the Goal Tracker team. We\'re here to help you achieve your goals.',
                canonicalUrl: 'https://goaltracker.com/contact',
                error: 'Please fill in all required fields.',
                success: null,
                formData: req.body
            });
        }

        // Check if email credentials are available
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.log('Email credentials not configured. Contact form submission:', {
                name, email, subject, message: message.substring(0, 100) + '...'
            });
            
            const successMessage = 'Thank you for your message! We have received your inquiry and will get back to you within 24 hours at ' + email + '. You can also reach us directly at goaltrackers2001@gmail.com.';
            
            if (isFromHomePage) {
                return res.redirect('/?success=' + encodeURIComponent(successMessage));
            }
            
            return res.render('contact', {
                title: 'Contact Us - Goal Tracker',
                description: 'Get in touch with the Goal Tracker team. We\'re here to help you achieve your goals.',
                canonicalUrl: 'https://goaltracker.com/contact',
                error: null,
                success: successMessage,
                formData: {}
            });
        }

        // Send contact email
        const nodemailer = require('nodemailer');
        
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: 'goaltrackers2001@gmail.com',
            subject: `Contact Form: ${subject}`,
            html: `
                <h2>New Contact Form Submission</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Subject:</strong> ${subject}</p>
                <p><strong>Message:</strong></p>
                <p>${message.replace(/\n/g, '<br>')}</p>
                <hr>
                <p><small>This message was sent from the Goal Tracker contact form.</small></p>
            `
        };

        await transporter.sendMail(mailOptions);

        const successMessage = 'Thank you for your message! We\'ll get back to you within 24 hours.';
        
        if (isFromHomePage) {
            return res.redirect('/?success=' + encodeURIComponent(successMessage));
        }

        res.render('contact', {
            title: 'Contact Us - Goal Tracker',
            description: 'Get in touch with the Goal Tracker team. We\'re here to help you achieve your goals.',
            canonicalUrl: 'https://goaltracker.com/contact',
            error: null,
            success: successMessage,
            formData: {}
        });

    } catch (error) {
        console.error('Contact form error:', error);
        
        // Log the contact form submission even if email fails
        console.log('Contact form submission (email failed):', {
            name: req.body.name,
            email: req.body.email,
            subject: req.body.subject,
            message: req.body.message ? req.body.message.substring(0, 100) + '...' : ''
        });
        
        const successMessage = 'Thank you for your message! We have received your inquiry and will get back to you within 24 hours. You can also reach us directly at goaltrackers2001@gmail.com.';
        const isFromHomePage = req.get('Referer') && req.get('Referer').includes('/#contact');
        
        if (isFromHomePage) {
            return res.redirect('/?success=' + encodeURIComponent(successMessage));
        }
        
        res.render('contact', {
            title: 'Contact Us - Goal Tracker',
            description: 'Get in touch with the Goal Tracker team. We\'re here to help you achieve your goals.',
            canonicalUrl: 'https://goaltracker.com/contact',
            error: null,
            success: successMessage,
            formData: {}
        });
    }
});

// Forgot password page
app.get('/forgot-password', (req, res) => {
    res.render('forgot-password', { 
        title: 'Forgot Password - Goal Tracker',
        description: 'Reset your Goal Tracker password. Enter your email to receive a password reset link.',
        canonicalUrl: 'https://goaltracker.com/forgot-password',
        error: null,
        success: null,
        formData: {}
    });
});

// Handle forgot password form
app.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.render('forgot-password', {
                title: 'Forgot Password - Goal Tracker',
                description: 'Reset your Goal Tracker password. Enter your email to receive a password reset link.',
                canonicalUrl: 'https://goaltracker.com/forgot-password',
                error: 'Please enter your email address.',
                success: null,
                formData: req.body
            });
        }

        // Check if user exists
        const db = require('./db/init');
        
        db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                console.error('Database error:', err);
                return res.render('forgot-password', {
                    title: 'Forgot Password - Goal Tracker',
                    description: 'Reset your Goal Tracker password. Enter your email to receive a password reset link.',
                    canonicalUrl: 'https://goaltracker.com/forgot-password',
                    error: 'An error occurred. Please try again.',
                    success: null,
                    formData: { email }
                });
            }

            if (!user) {
                // Don't reveal if email exists or not for security
                return res.render('forgot-password', {
                    title: 'Forgot Password - Goal Tracker',
                    description: 'Reset your Goal Tracker password. Enter your email to receive a password reset link.',
                    canonicalUrl: 'https://goaltracker.com/forgot-password',
                    error: null,
                    success: 'If an account with that email exists, you will receive a password reset link shortly.',
                    formData: {}
                });
            }

            // Generate reset token
            const crypto = require('crypto');
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetExpires = new Date();
            resetExpires.setHours(resetExpires.getHours() + 1); // 1 hour expiry

            // Save reset token to database
            db.run('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?',
                [resetToken, resetExpires.toISOString(), user.id],
                async (err) => {
                    if (err) {
                        console.error('Error saving reset token:', err);
                        return res.render('forgot-password', {
                            title: 'Forgot Password - Goal Tracker',
                            description: 'Reset your Goal Tracker password. Enter your email to receive a password reset link.',
                            canonicalUrl: 'https://goaltracker.com/forgot-password',
                            error: 'An error occurred. Please try again.',
                            success: null,
                            formData: { email }
                        });
                    }

                    // Send reset email
                    try {
                        const { sendPasswordResetEmail } = require('./utils/emailService');
                        await sendPasswordResetEmail(user, resetToken);

                        res.render('forgot-password', {
                            title: 'Forgot Password - Goal Tracker',
                            description: 'Reset your Goal Tracker password. Enter your email to receive a password reset link.',
                            canonicalUrl: 'https://goaltracker.com/forgot-password',
                            error: null,
                            success: 'Password reset link sent! Check your email and follow the instructions to reset your password.',
                            formData: {}
                        });
                    } catch (emailError) {
                        console.error('Failed to send reset email:', emailError);
                        res.render('forgot-password', {
                            title: 'Forgot Password - Goal Tracker',
                            description: 'Reset your Goal Tracker password. Enter your email to receive a password reset link.',
                            canonicalUrl: 'https://goaltracker.com/forgot-password',
                            error: 'Failed to send reset email. Please try again or contact support.',
                            success: null,
                            formData: { email }
                        });
                    }
                }
            );
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.render('forgot-password', {
            title: 'Forgot Password - Goal Tracker',
            description: 'Reset your Goal Tracker password. Enter your email to receive a password reset link.',
            canonicalUrl: 'https://goaltracker.com/forgot-password',
            error: 'An error occurred. Please try again.',
            success: null,
            formData: req.body
        });
    }
});

// Reset password page
app.get('/reset-password/:token', (req, res) => {
    const token = req.params.token;
    
    // Verify token exists and is not expired
    const db = require('./db/init');
    
    db.get('SELECT * FROM users WHERE reset_token = ? AND reset_expires > ?', 
        [token, new Date().toISOString()], 
        (err, user) => {
            if (err || !user) {
                return res.render('error', {
                    title: 'Invalid Reset Link - Goal Tracker',
                    error: 'This password reset link is invalid or has expired. Please request a new one.'
                });
            }

            res.render('reset-password', {
                title: 'Reset Password - Goal Tracker',
                description: 'Create a new password for your Goal Tracker account.',
                canonicalUrl: `https://goaltracker.com/reset-password/${token}`,
                token: token,
                error: null,
                success: null
            });
        }
    );
});

// Handle reset password form
app.post('/reset-password', async (req, res) => {
    try {
        const { token, password, confirmPassword } = req.body;

        if (!password || !confirmPassword) {
            return res.render('reset-password', {
                title: 'Reset Password - Goal Tracker',
                description: 'Create a new password for your Goal Tracker account.',
                canonicalUrl: `https://goaltracker.com/reset-password/${token}`,
                token: token,
                error: 'Please fill in all fields.',
                success: null
            });
        }

        if (password !== confirmPassword) {
            return res.render('reset-password', {
                title: 'Reset Password - Goal Tracker',
                description: 'Create a new password for your Goal Tracker account.',
                canonicalUrl: `https://goaltracker.com/reset-password/${token}`,
                token: token,
                error: 'Passwords do not match.',
                success: null
            });
        }

        if (password.length < 8) {
            return res.render('reset-password', {
                title: 'Reset Password - Goal Tracker',
                description: 'Create a new password for your Goal Tracker account.',
                canonicalUrl: `https://goaltracker.com/reset-password/${token}`,
                token: token,
                error: 'Password must be at least 8 characters long.',
                success: null
            });
        }

        // Verify token and get user
        const db = require('./db/init');
        
        db.get('SELECT * FROM users WHERE reset_token = ? AND reset_expires > ?', 
            [token, new Date().toISOString()], 
            async (err, user) => {
                if (err || !user) {
                    return res.render('error', {
                        title: 'Invalid Reset Link - Goal Tracker',
                        error: 'This password reset link is invalid or has expired. Please request a new one.'
                    });
                }

                // Hash new password
                const bcrypt = require('bcrypt');
                const hashedPassword = await bcrypt.hash(password, 10);

                // Update password and clear reset token
                db.run('UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?',
                    [hashedPassword, user.id],
                    (err) => {
                        if (err) {
                            console.error('Error updating password:', err);
                            return res.render('reset-password', {
                                title: 'Reset Password - Goal Tracker',
                                description: 'Create a new password for your Goal Tracker account.',
                                canonicalUrl: `https://goaltracker.com/reset-password/${token}`,
                                token: token,
                                error: 'An error occurred. Please try again.',
                                success: null
                            });
                        }

                        // Password reset successful - redirect to login
                        res.redirect('/login?message=password_reset_success');
                    }
                );
            }
        );

    } catch (error) {
        console.error('Reset password error:', error);
        res.render('reset-password', {
            title: 'Reset Password - Goal Tracker',
            description: 'Create a new password for your Goal Tracker account.',
            canonicalUrl: `https://goaltracker.com/reset-password/${req.body.token}`,
            token: req.body.token,
            error: 'An error occurred. Please try again.',
            success: null
        });
    }
});

app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    
    let successMessage = null;
    if (req.query.message === 'password_reset_success') {
        successMessage = 'Your password has been reset successfully. You can now log in with your new password.';
    }
    
    res.render('login', { 
        title: 'Login - Goal Tracker',
        description: 'Sign in to your Goal Tracker account and continue achieving your goals.',
        canonicalUrl: 'https://goaltracker.com/login',
        error: null,
        success: successMessage,
        formData: {}
    });
});

app.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('register', { 
        title: 'Register - Goal Tracker',
        description: 'Create your free Goal Tracker account and start achieving your dreams today.',
        canonicalUrl: 'https://goaltracker.com/register',
        error: null,
        formData: {}
    });
});

app.get('/verify-email', (req, res) => {
    // Check if there's a pending user waiting for verification
    if (!req.session.pendingUser) {
        return res.redirect('/register');
    }
    
    // Check if user was redirected from registration attempt
    let successMessage = null;
    if (req.query.from === 'register') {
        successMessage = 'We found an existing account with this email. We\'ve sent a fresh verification code to complete your registration.';
    }
    
    res.render('verify-email', { 
        title: 'Verify Email - Goal Tracker',
        error: null,
        success: successMessage,
        email: req.session.pendingUser.email
    });
});

app.get('/dashboard', isAuthenticated, (req, res) => {
    res.redirect('/goals/dashboard'); // Redirect to the new goals dashboard
});

// Import and use route handlers
const authRoutes = require('./routes/auth');
const goalRoutes = require('./routes/goals');
const subscriptionRoutes = require('./routes/subscription');
const communityRoutes = require('./routes/community');
const adminRoutes = require('./routes/admin');
const aiRoutes = require('./routes/ai');
const apiRoutes = require('./routes/api');
const blogRoutes = require('./routes/blog');
const tutorialRoutes = require('./routes/tutorials');
const socialRoutes = require('./routes/social');

app.use('/auth', authRoutes);
app.use('/api/goals', goalRoutes);
app.use('/goals', goalRoutes); // Add new page routes
app.use('/subscription', subscriptionRoutes); // Add subscription routes
app.use('/community', communityRoutes); // Add community routes
app.use('/admin', adminRoutes); // Add admin routes
app.use('/api/ai', aiRoutes); // Add AI feature routes
app.use('/api', apiRoutes); // Add API routes for search and chat
app.use('/blog', blogRoutes); // Add blog routes
app.use('/api/tutorials', tutorialRoutes);
app.use('/api/social', socialRoutes);

// Add profile route
app.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.redirect('/auth/profile');
});

// AdSense Configuration Route (admin only)
app.post('/admin/adsense/config', (req, res) => {
    if (!req.session.user || !req.session.user.is_admin) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    const { clientId } = req.body;
    
    if (!clientId || !clientId.startsWith('ca-pub-')) {
        return res.status(400).json({ error: 'Invalid AdSense client ID format' });
    }
    
    // Update environment variable (in production, this would be stored in database or env file)
    process.env.GOOGLE_ADSENSE_CLIENT_ID = clientId;
    
    res.json({ 
        success: true, 
        message: 'AdSense client ID updated successfully',
        clientId: clientId
    });
});

// AdSense Analytics Route (for admin to view AdSense performance)
app.get('/api/adsense/analytics', (req, res) => {
    if (!req.session.user || !req.session.user.is_admin) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    const db = require('./db/init');
    
    // Get AdSense impression analytics
    db.all(`
        SELECT 
            DATE(created_at) as date,
            COUNT(*) as impressions,
            COUNT(DISTINCT user_id) as unique_users,
            COUNT(DISTINCT ip_address) as unique_ips
        FROM adsense_impressions 
        WHERE created_at >= date('now', '-30 days')
        GROUP BY DATE(created_at)
        ORDER BY date DESC
    `, (err, analytics) => {
        if (err) {
            console.error('Error fetching AdSense analytics:', err);
            return res.status(500).json({ error: 'Failed to fetch analytics' });
        }
        
        // Get total stats
        db.get(`
            SELECT 
                COUNT(*) as total_impressions,
                COUNT(DISTINCT user_id) as total_users,
                COUNT(DISTINCT ip_address) as total_ips
            FROM adsense_impressions
        `, (err, totals) => {
            if (err) {
                console.error('Error fetching AdSense totals:', err);
                return res.status(500).json({ error: 'Failed to fetch totals' });
            }
            
            res.json({
                analytics: analytics || [],
                totals: totals || { total_impressions: 0, total_users: 0, total_ips: 0 }
            });
        });
    });
});

// Add notifications route
app.get('/notifications', isAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const db = require('./db/init');
    
    db.all(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err, notifications) => {
            if (err) {
                console.error('Error fetching notifications:', err);
                return res.status(500).render('error', {
                    title: 'Error - Goal Tracker',
                    error: 'Failed to load notifications. Please try again.'
                });
            }
            
            res.render('notifications', {
                title: 'Notifications - Goal Tracker',
                notifications: notifications || []
            });
        }
    );
});

// Community page
app.get('/community', isAuthenticated, (req, res) => {
    res.render('community', { 
        title: 'Community - Goal Tracker',
        user: req.session.user,
        showAds: shouldShowAds(req.session.user),
        adsenseConfig: adsenseConfig
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        title: 'Error - Goal Tracker',
        error: 'Something went wrong! Please try again.'
    });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}); 