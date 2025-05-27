const db = require('../db/init');

// Middleware to inject tutorial data into all responses
const injectTutorialData = async (req, res, next) => {
    if (!req.session.user) {
        return next();
    }

    const userId = req.session.user.id;
    const currentPath = req.path;

    try {
        // Get all tutorials for the current page
        const tutorials = await new Promise((resolve, reject) => {
            db.all(`
                SELECT t.*, 
                       CASE WHEN utp.completed_at IS NOT NULL THEN 1 ELSE 0 END as completed
                FROM tutorials t
                LEFT JOIN user_tutorial_progress utp 
                    ON t.id = utp.tutorial_id 
                    AND utp.user_id = ?
                WHERE t.page_path = ? 
                   OR t.page_path LIKE ?
                ORDER BY t.order_index ASC
            `, [userId, currentPath, currentPath.replace(/\/\d+/, '/:id')], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get overall tutorial progress
        const progress = await new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    COUNT(DISTINCT t.id) as total_tutorials,
                    COUNT(DISTINCT utp.tutorial_id) as completed_tutorials
                FROM tutorials t
                LEFT JOIN user_tutorial_progress utp 
                    ON t.id = utp.tutorial_id 
                    AND utp.user_id = ?
                WHERE t.is_required = 1
            `, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Calculate progress percentage
        const progressPercentage = progress.total_tutorials > 0 
            ? Math.round((progress.completed_tutorials / progress.total_tutorials) * 100)
            : 0;

        // Add tutorial data to res.locals for use in templates
        res.locals.tutorials = tutorials;
        res.locals.tutorialProgress = {
            total: progress.total_tutorials,
            completed: progress.completed_tutorials,
            percentage: progressPercentage
        };

        // Check if this is the user's first visit
        if (!req.session.tutorialShown) {
            res.locals.showTutorial = true;
            req.session.tutorialShown = true;
        }

        next();
    } catch (error) {
        console.error('Error loading tutorial data:', error);
        next();
    }
};

module.exports = {
    injectTutorialData
}; 