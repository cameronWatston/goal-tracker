const db = require('../db/init');

// Automatic AdSense middleware - Shows ads to free users only
function loadAutoAdsense(req, res, next) {
    res.locals.showAds = false;
    res.locals.adsenseConfig = null;
    
    // Only show ads to authenticated users with free plans
    if (req.session.user && req.session.user.subscription_plan === 'free') {
        res.locals.showAds = true;
        res.locals.adsenseConfig = {
            clientId: process.env.GOOGLE_ADSENSE_CLIENT_ID || 'ca-pub-0000000000000000', // Default test ID
            enabled: true,
            autoAds: true,
            adFormats: {
                display: true,
                inFeed: true,
                inArticle: true,
                matchedContent: true
            },
            placements: [
                {
                    id: 'top-banner',
                    type: 'display',
                    size: 'responsive',
                    style: 'display:block',
                    format: 'auto',
                    fullWidthResponsive: true
                },
                {
                    id: 'sidebar-banner',
                    type: 'display', 
                    size: '300x250',
                    style: 'display:inline-block;width:300px;height:250px',
                    format: 'rectangle'
                },
                {
                    id: 'content-banner',
                    type: 'display',
                    size: 'responsive',
                    style: 'display:block',
                    format: 'auto',
                    fullWidthResponsive: true
                }
            ]
        };
        
        // Track ad impression for analytics
        trackAdImpression(req);
    }
    
    next();
}

// Track ad impressions for free users
function trackAdImpression(req) {
    const userId = req.session.user ? req.session.user.id : null;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    const pageUrl = req.originalUrl;
    
    // Log impression to database for analytics
    db.run(`INSERT INTO adsense_impressions 
        (user_id, ip_address, page_url, user_agent, created_at) 
        VALUES (?, ?, ?, ?, datetime('now'))`,
        [userId, ipAddress, pageUrl, userAgent],
        (err) => {
            if (err) {
                console.error('Error tracking AdSense impression:', err);
            }
        });
}

// Initialize AdSense tracking table
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS adsense_impressions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        ip_address TEXT,
        page_url TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )`, (err) => {
        if (err) {
            console.error('Error creating adsense_impressions table:', err);
        } else {
            console.log('✅ AdSense impressions tracking table ready');
        }
    });
});

module.exports = {
    loadAutoAdsense
}; 