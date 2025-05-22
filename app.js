const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const dotenv = require('dotenv');
const { loadEnvVariables } = require('./utils/envLoader');
const db = require('./db/init');
const helmet = require('helmet');

// Load environment variables
console.log('====== Starting Goal Tracker Application ======');
loadEnvVariables();

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

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;

app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore({
        db: 'sessions.sqlite',
        dir: './db'
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

// Make user data available to all views
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
        error: null,
        formData: {}
    });
});

app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('login', { 
        title: 'Login - Goal Tracker',
        error: null,
        formData: {}
    });
});

app.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('register', { 
        title: 'Register - Goal Tracker',
        error: null,
        formData: {}
    });
});

app.get('/verify-email', (req, res) => {
    // Check if there's a pending user waiting for verification
    if (!req.session.pendingUser) {
        return res.redirect('/register');
    }
    
    res.render('verify-email', { 
        title: 'Verify Email - Goal Tracker',
        error: null,
        success: null,
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

app.use('/auth', authRoutes);
app.use('/api/goals', goalRoutes);
app.use('/goals', goalRoutes); // Add new page routes
app.use('/subscription', subscriptionRoutes); // Add subscription routes
app.use('/community', communityRoutes); // Add community routes

// Add profile route
app.get('/profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.redirect('/auth/profile');
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