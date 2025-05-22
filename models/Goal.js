const db = require('../db/init');

class Goal {
    // Get all goals
    static getAllGoals(callback) {
        const query = `
            SELECT goals.*, users.username 
            FROM goals 
            JOIN users ON goals.user_id = users.id
            ORDER BY goals.created_at DESC
        `;
        db.all(query, [], callback);
    }

    // Get all goals for a specific user
    static getGoalsByUser(userId, callback) {
        const query = `
            SELECT * FROM goals 
            WHERE user_id = ?
            ORDER BY created_at DESC
        `;
        db.all(query, [userId], callback);
    }

    // Get a single goal
    static getGoalById(goalId, callback) {
        db.get('SELECT * FROM goals WHERE id = ?', [goalId], callback);
    }

    // Create a new goal
    static createGoal(goalData, callback) {
        const { user_id, title, description, category, target_date } = goalData;
        const createdAt = new Date().toISOString();
        const updatedAt = createdAt;
        
        db.run(
            'INSERT INTO goals (user_id, title, description, category, target_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [user_id, title, description, category, target_date, createdAt, updatedAt],
            function(err) {
                if (err) {
                    return callback(err);
                }
                callback(null, this.lastID);
            }
        );
    }

    // Update a goal
    static updateGoal(goalId, goalData, callback) {
        const { title, description, category, target_date, status } = goalData;
        const updatedAt = new Date().toISOString();
        
        db.run(
            'UPDATE goals SET title = ?, description = ?, category = ?, target_date = ?, status = ?, updated_at = ? WHERE id = ?',
            [title, description, category, target_date, status, updatedAt, goalId],
            callback
        );
    }

    // Delete a goal
    static deleteGoal(goalId, callback) {
        db.run('DELETE FROM goals WHERE id = ?', [goalId], callback);
    }

    // Get goal with milestones
    static getGoalWithMilestones(goalId, callback) {
        db.get('SELECT goals.*, users.username FROM goals JOIN users ON goals.user_id = users.id WHERE goals.id = ?', 
            [goalId], 
            (err, goal) => {
                if (err || !goal) {
                    return callback(err, null);
                }
                
                // Get milestones for this goal
                db.all('SELECT * FROM milestones WHERE goal_id = ? ORDER BY target_date ASC', 
                    [goalId], 
                    (err, milestones) => {
                        if (err) {
                            return callback(err, null);
                        }
                        
                        goal.milestones = milestones;
                        callback(null, goal);
                    }
                );
            }
        );
    }
}

module.exports = Goal; 