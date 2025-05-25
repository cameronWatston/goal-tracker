const db = require('../db/init');

/**
 * Middleware to load SEO settings for the current page
 */
const loadSeoSettings = (req, res, next) => {
    const currentPath = req.path;
    
    // Query for SEO settings for this specific page
    db.get('SELECT * FROM seo_settings WHERE page_path = ? AND is_active = 1', [currentPath], (err, seoData) => {
        if (err) {
            console.error('Error loading SEO settings:', err);
            // Fallback to default SEO settings
            res.locals.seo = getDefaultSeoSettings(currentPath);
        } else if (seoData) {
            // Use database SEO settings
            res.locals.seo = {
                title: seoData.title || getDefaultTitle(currentPath),
                description: seoData.description || getDefaultDescription(),
                keywords: seoData.keywords || getDefaultKeywords(),
                ogTitle: seoData.og_title || seoData.title || getDefaultTitle(currentPath),
                ogDescription: seoData.og_description || seoData.description || getDefaultDescription(),
                ogImage: seoData.og_image || 'https://goaltracker.com/img/og-image.jpg',
                twitterTitle: seoData.twitter_title || seoData.title || getDefaultTitle(currentPath),
                twitterDescription: seoData.twitter_description || seoData.description || getDefaultDescription(),
                twitterImage: seoData.twitter_image || seoData.og_image || 'https://goaltracker.com/img/twitter-card.jpg',
                canonicalUrl: seoData.canonical_url || `https://goaltracker.com${currentPath}`,
                structuredData: seoData.structured_data ? JSON.parse(seoData.structured_data) : getDefaultStructuredData(),
                customMeta: seoData.custom_meta || ''
            };
        } else {
            // No specific SEO settings found, use defaults
            res.locals.seo = getDefaultSeoSettings(currentPath);
        }
        
        next();
    });
};

/**
 * Get default SEO settings for fallback
 */
function getDefaultSeoSettings(path) {
    return {
        title: getDefaultTitle(path),
        description: getDefaultDescription(),
        keywords: getDefaultKeywords(),
        ogTitle: getDefaultTitle(path),
        ogDescription: getDefaultDescription(),
        ogImage: 'https://goaltracker.com/img/og-image.jpg',
        twitterTitle: getDefaultTitle(path),
        twitterDescription: getDefaultDescription(),
        twitterImage: 'https://goaltracker.com/img/twitter-card.jpg',
        canonicalUrl: `https://goaltracker.com${path}`,
        structuredData: getDefaultStructuredData(),
        customMeta: ''
    };
}

/**
 * Generate default title based on path
 */
function getDefaultTitle(path) {
    const titleMap = {
        '/': 'Goal Tracker - Achieve More with AI',
        '/login': 'Login - Goal Tracker',
        '/register': 'Register - Goal Tracker',
        '/contact': 'Contact Us - Goal Tracker',
        '/dashboard': 'Dashboard - Goal Tracker',
        '/subscription': 'Premium Upgrade - Goal Tracker',
        '/community': 'Community - Goal Tracker',
        '/forgot-password': 'Forgot Password - Goal Tracker'
    };
    
    return titleMap[path] || 'Goal Tracker - AI-Powered Goal Achievement';
}

/**
 * Get default description
 */
function getDefaultDescription() {
    return 'Transform your dreams into reality with our AI-powered goal tracking platform. Join 25,000+ users achieving their biggest goals.';
}

/**
 * Get default keywords
 */
function getDefaultKeywords() {
    return 'goal tracking, goal achievement, AI goals, personal development, productivity, milestone tracking, success planning, goal setting';
}

/**
 * Get default structured data
 */
function getDefaultStructuredData() {
    return {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "Goal Tracker",
        "description": "AI-powered goal tracking and achievement platform",
        "url": "https://goaltracker.com",
        "applicationCategory": "ProductivityApplication",
        "operatingSystem": "Any",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "GBP",
            "description": "Free plan available"
        },
        "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.9",
            "ratingCount": "25000",
            "bestRating": "5",
            "worstRating": "1"
        },
        "author": {
            "@type": "Organization",
            "name": "Goal Tracker",
            "email": "goaltrackers2001@gmail.com"
        }
    };
}

module.exports = {
    loadSeoSettings
}; 