const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { isAuthenticated } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(isAuthenticated);

// Get tutorial progress
router.get('/progress', (req, res) => {
    const userId = req.session.user.id;
    
    db.get(`
        SELECT 
            COUNT(DISTINCT t.id) as total_tutorials,
            COUNT(DISTINCT utp.tutorial_id) as completed_tutorials
        FROM tutorials t
        LEFT JOIN user_tutorial_progress utp 
            ON t.id = utp.tutorial_id 
            AND utp.user_id = ?
        WHERE t.is_required = 1
    `, [userId], (err, progress) => {
        if (err) {
            console.error('Error fetching tutorial progress:', err);
            return res.status(500).json({ error: 'Failed to fetch tutorial progress' });
        }
        
        const progressPercentage = progress.total_tutorials > 0 
            ? Math.round((progress.completed_tutorials / progress.total_tutorials) * 100)
            : 0;
            
        res.json({
            total: progress.total_tutorials,
            completed: progress.completed_tutorials,
            percentage: progressPercentage
        });
    });
});

// Mark tutorial as completed
router.post('/:id/complete', (req, res) => {
    const tutorialId = req.params.id;
    const userId = req.session.user.id;
    
    db.run(`
        INSERT OR IGNORE INTO user_tutorial_progress (user_id, tutorial_id)
        VALUES (?, ?)
    `, [userId, tutorialId], function(err) {
        if (err) {
            console.error('Error marking tutorial as completed:', err);
            return res.status(500).json({ error: 'Failed to update tutorial progress' });
        }
        
        res.json({ success: true });
    });
});

// Reset tutorial progress
router.post('/reset', (req, res) => {
    const userId = req.session.user.id;
    
    db.run('DELETE FROM user_tutorial_progress WHERE user_id = ?', [userId], function(err) {
        if (err) {
            console.error('Error resetting tutorial progress:', err);
            return res.status(500).json({ error: 'Failed to reset tutorial progress' });
        }
        
        // Reset the tutorial shown flag in session
        req.session.tutorialShown = false;
        
        res.json({ success: true });
    });
});

// Get tutorials for a specific page
router.get('/page/:path(*)', (req, res) => {
    const userId = req.session.user.id;
    const pagePath = '/' + req.params.path;
    
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
    `, [userId, pagePath, pagePath.replace(/\/\d+/, '/:id')], (err, tutorials) => {
        if (err) {
            console.error('Error fetching tutorials:', err);
            return res.status(500).json({ error: 'Failed to fetch tutorials' });
        }
        
        res.json(tutorials);
    });
});

module.exports = router; 