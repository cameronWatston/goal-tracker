const db = require('../db/init');

// IP tracking middleware for admin analytics with privacy compliance
const trackIP = (req, res, next) => {
    // Skip tracking for admin routes and API calls only (allow static assets for debugging)
    const skipPaths = ['/admin', '/api/'];
    const shouldSkip = skipPaths.some(path => req.path.startsWith(path));
    
    if (shouldSkip) {
        return next();
    }

    // Get IP address (handle proxy/load balancer scenarios)
    const getClientIP = (req) => {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.ip ||
               'unknown';
    };

    // Anonymize IP for privacy compliance (remove last octet)
    const anonymizeIP = (ip) => {
        if (ip.includes(':')) {
            // IPv6 - remove last 2 groups
            const parts = ip.split(':');
            return parts.slice(0, -2).join(':') + '::';
        } else {
            // IPv4 - remove last octet
            const parts = ip.split('.');
            if (parts.length === 4) {
                return parts.slice(0, -1).join('.') + '.0';
            }
        }
        return ip;
    };

    const rawIP = getClientIP(req);
    const ipAddress = anonymizeIP(rawIP);
    const userAgent = req.get('User-Agent') || 'unknown';
    const referer = req.get('Referer') || '';
    const pagePath = req.path;

    // Skip if IP is unknown, localhost, or private IPs
    if (ipAddress === 'unknown' || 
        rawIP === '::1' || 
        rawIP.startsWith('127.') ||
        rawIP.startsWith('192.168.') ||
        rawIP.startsWith('10.') ||
        rawIP.startsWith('172.16.') ||
        rawIP.startsWith('172.17.') ||
        rawIP.startsWith('172.18.') ||
        rawIP.startsWith('172.19.') ||
        rawIP.startsWith('172.2') ||
        rawIP.startsWith('172.30.') ||
        rawIP.startsWith('172.31.')) {
        return next();
    }

    // More lenient bot detection (only obvious bots)
    const botPatterns = [
        /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i,
        /baiduspider/i, /yandexbot/i, /facebookexternalhit/i
    ];
    
    const isBot = botPatterns.some(pattern => pattern.test(userAgent));
    if (isBot) {
        return next();
    }

    // Always log for debugging - especially requests with referers
    if (referer) {
        console.log(`🔗 Referer found: ${ipAddress} came from ${referer} to visit ${pagePath}`);
    }

    // Check if this IP has visited before
    db.get(
        'SELECT * FROM ip_visits WHERE ip_address = ?',
        [ipAddress],
        (err, existingVisit) => {
            if (err) {
                console.error('Error checking IP visit:', err);
                return next();
            }

            const now = new Date().toISOString();

            if (existingVisit) {
                // Update existing IP record (rate limit to prevent spam)
                const lastVisit = new Date(existingVisit.last_visit);
                const timeSinceLastVisit = Date.now() - lastVisit.getTime();
                
                // Only update if more than 5 minutes since last visit
                if (timeSinceLastVisit > 5 * 60 * 1000) {
                    db.run(`
                        UPDATE ip_visits 
                        SET last_visit = ?, 
                            visit_count = visit_count + 1,
                            user_agent = ?,
                            page_path = ?
                        WHERE ip_address = ?
                    `, [now, userAgent, pagePath, ipAddress], (err) => {
                        if (err) {
                            console.error('Error updating IP visit:', err);
                        }
                    });
                }
            } else {
                // Insert new IP record
                db.run(`
                    INSERT INTO ip_visits (
                        ip_address, user_agent, referer, page_path, 
                        first_visit, last_visit, visit_count, is_unique
                    ) VALUES (?, ?, ?, ?, ?, ?, 1, 1)
                `, [ipAddress, userAgent, referer, pagePath, now, now], (err) => {
                    if (err) {
                        console.error('Error inserting IP visit:', err);
                    } else {
                        console.log(`📊 New unique visitor tracked: ${ipAddress}`);
                    }
                });
            }
        }
    );

    next();
};

// Cleanup old IP data for privacy compliance (run daily)
const cleanupOldIPData = () => {
    const retentionDays = 90; // Keep data for 90 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    db.run(
        'DELETE FROM ip_visits WHERE first_visit < ?',
        [cutoffDate.toISOString()],
        function(err) {
            if (err) {
                console.error('Error cleaning up old IP data:', err);
            } else {
                console.log(`🧹 Cleaned up ${this.changes} old IP records`);
            }
        }
    );
};

// Run cleanup daily
setInterval(cleanupOldIPData, 24 * 60 * 60 * 1000);

// Get IP analytics for admin dashboard
const getIPAnalytics = async () => {
    return new Promise((resolve, reject) => {
        // Get comprehensive IP statistics
        db.all(`
            SELECT 
                COUNT(DISTINCT ip_address) as unique_ips,
                COUNT(*) as total_visits,
                COUNT(CASE WHEN DATE(first_visit) = DATE('now') THEN 1 END) as new_ips_today,
                COUNT(CASE WHEN DATE(first_visit) >= DATE('now', '-7 days') THEN 1 END) as new_ips_week,
                COUNT(CASE WHEN DATE(first_visit) >= DATE('now', '-30 days') THEN 1 END) as new_ips_month,
                COUNT(CASE WHEN DATE(last_visit) = DATE('now') THEN 1 END) as active_ips_today,
                COUNT(CASE WHEN DATE(last_visit) >= DATE('now', '-7 days') THEN 1 END) as active_ips_week,
                AVG(visit_count) as avg_visits_per_ip,
                MAX(visit_count) as max_visits_from_single_ip
            FROM ip_visits
        `, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const stats = rows[0];
                resolve({
                    unique_ips: stats.unique_ips || 0,
                    total_visits: stats.total_visits || 0,
                    new_ips_today: stats.new_ips_today || 0,
                    new_ips_week: stats.new_ips_week || 0,
                    new_ips_month: stats.new_ips_month || 0,
                    active_ips_today: stats.active_ips_today || 0,
                    active_ips_week: stats.active_ips_week || 0,
                    avg_visits_per_ip: Math.round(stats.avg_visits_per_ip || 0),
                    max_visits_from_single_ip: stats.max_visits_from_single_ip || 0
                });
            }
        });
    });
};

// Get top visiting IPs (anonymized)
const getTopIPs = async (limit = 10) => {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                ip_address,
                visit_count,
                first_visit,
                last_visit,
                CASE 
                    WHEN user_agent LIKE '%bot%' OR user_agent LIKE '%crawler%' THEN 'Bot/Crawler'
                    WHEN user_agent LIKE '%Mobile%' THEN 'Mobile Browser'
                    WHEN user_agent LIKE '%Chrome%' THEN 'Chrome Browser'
                    WHEN user_agent LIKE '%Firefox%' THEN 'Firefox Browser'
                    WHEN user_agent LIKE '%Safari%' THEN 'Safari Browser'
                    ELSE 'Other Browser'
                END as browser_type,
                page_path
            FROM ip_visits 
            ORDER BY visit_count DESC 
            LIMIT ?
        `, [limit], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
};

// Get recent IP visits
const getRecentIPVisits = async (limit = 20) => {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                ip_address,
                visit_count,
                first_visit,
                last_visit,
                CASE 
                    WHEN user_agent LIKE '%Mobile%' THEN 'Mobile'
                    WHEN user_agent LIKE '%Chrome%' THEN 'Chrome'
                    WHEN user_agent LIKE '%Firefox%' THEN 'Firefox'
                    WHEN user_agent LIKE '%Safari%' THEN 'Safari'
                    ELSE 'Other'
                END as device_type,
                page_path,
                referer
            FROM ip_visits 
            ORDER BY last_visit DESC 
            LIMIT ?
        `, [limit], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
};

// Get IP visit trends (daily data for the last 30 days)
const getIPTrends = async () => {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                DATE(first_visit) as visit_date,
                COUNT(DISTINCT ip_address) as new_unique_ips,
                COUNT(*) as total_new_visits
            FROM ip_visits 
            WHERE DATE(first_visit) >= DATE('now', '-30 days')
            GROUP BY DATE(first_visit)
            ORDER BY visit_date ASC
        `, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows || []);
            }
        });
    });
};

module.exports = {
    trackIP,
    getIPAnalytics,
    getTopIPs,
    getRecentIPVisits,
    getIPTrends,
    cleanupOldIPData
}; 