const db = require('../db/init');

class Post {
    // Get all posts with user info and like counts
    static getAllPosts(callback) {
        const query = `
            SELECT posts.*, users.username,
                   (SELECT COUNT(*) FROM post_likes WHERE post_likes.post_id = posts.id) as like_count
            FROM posts 
            JOIN users ON posts.user_id = users.id
            ORDER BY posts.created_at DESC
        `;
        db.all(query, [], callback);
    }

    // Get posts by a specific user with like counts
    static getPostsByUser(userId, callback) {
        const query = `
            SELECT posts.*, users.username,
                   (SELECT COUNT(*) FROM post_likes WHERE post_likes.post_id = posts.id) as like_count
            FROM posts 
            JOIN users ON posts.user_id = users.id
            WHERE posts.user_id = ?
            ORDER BY posts.created_at DESC
        `;
        db.all(query, [userId], callback);
    }

    // Get a single post with comments and likes
    static getPostWithComments(postId, callback) {
        db.get(`
            SELECT posts.*, users.username,
                   (SELECT COUNT(*) FROM post_likes WHERE post_likes.post_id = posts.id) as like_count
            FROM posts 
            JOIN users ON posts.user_id = users.id 
            WHERE posts.id = ?
        `, [postId], (err, post) => {
            if (err || !post) {
                return callback(err, null);
            }
            
            // Get comments for this post
            db.all(`
                SELECT comments.*, users.username 
                FROM comments 
                JOIN users ON comments.user_id = users.id
                WHERE comments.post_id = ?
                ORDER BY comments.created_at ASC
            `, [postId], (err, comments) => {
                if (err) {
                    return callback(err, null);
                }
                
                post.comments = comments;
                callback(null, post);
            });
        });
    }

    // Check if user has liked a post
    static checkUserLike(postId, userId, callback) {
        db.get('SELECT * FROM post_likes WHERE post_id = ? AND user_id = ?',
            [postId, userId],
            (err, like) => {
                if (err) {
                    return callback(err, false);
                }
                callback(null, !!like);
            }
        );
    }

    // Get all posts with user like status
    static getAllPostsWithLikeStatus(userId, callback) {
        const query = `
            SELECT posts.*, users.username,
                   (SELECT COUNT(*) FROM post_likes WHERE post_likes.post_id = posts.id) as like_count,
                   EXISTS(SELECT 1 FROM post_likes WHERE post_likes.post_id = posts.id AND post_likes.user_id = ?) as user_liked
            FROM posts 
            JOIN users ON posts.user_id = users.id
            ORDER BY posts.created_at DESC
        `;
        db.all(query, [userId], callback);
    }

    // Get a single post with comments and user like status
    static getPostWithCommentsAndLikeStatus(postId, userId, callback) {
        db.get(`
            SELECT posts.*, users.username,
                   (SELECT COUNT(*) FROM post_likes WHERE post_likes.post_id = posts.id) as like_count,
                   EXISTS(SELECT 1 FROM post_likes WHERE post_likes.post_id = posts.id AND post_likes.user_id = ?) as user_liked
            FROM posts 
            JOIN users ON posts.user_id = users.id 
            WHERE posts.id = ?
        `, [userId, postId], (err, post) => {
            if (err || !post) {
                return callback(err, null);
            }
            
            // Get comments for this post
            db.all(`
                SELECT comments.*, users.username 
                FROM comments 
                JOIN users ON comments.user_id = users.id
                WHERE comments.post_id = ?
                ORDER BY comments.created_at ASC
            `, [postId], (err, comments) => {
                if (err) {
                    return callback(err, null);
                }
                
                post.comments = comments;
                callback(null, post);
            });
        });
    }

    // Create a new post
    static createPost(userId, title, content, goalId = null, callback) {
        const createdAt = new Date().toISOString();
        db.run(
            'INSERT INTO posts (user_id, title, content, goal_id, created_at) VALUES (?, ?, ?, ?, ?)',
            [userId, title, content, goalId, createdAt],
            function(err) {
                if (err) {
                    return callback(err);
                }
                callback(null, this.lastID);
            }
        );
    }

    // Update a post
    static updatePost(postId, title, content, callback) {
        db.run(
            'UPDATE posts SET title = ?, content = ? WHERE id = ?',
            [title, content, postId],
            callback
        );
    }

    // Delete a post
    static deletePost(postId, callback) {
        db.run('DELETE FROM posts WHERE id = ?', [postId], callback);
    }

    // Add comment to a post
    static addComment(postId, userId, content, callback) {
        const createdAt = new Date().toISOString();
        db.run(
            'INSERT INTO comments (post_id, user_id, content, created_at) VALUES (?, ?, ?, ?)',
            [postId, userId, content, createdAt],
            function(err) {
                if (err) {
                    return callback(err);
                }
                callback(null, this.lastID);
            }
        );
    }

    // Like a post
    static likePost(postId, userId, callback) {
        db.run(
            'INSERT OR IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)',
            [postId, userId],
            callback
        );
    }

    // Unlike a post
    static unlikePost(postId, userId, callback) {
        db.run(
            'DELETE FROM post_likes WHERE post_id = ? AND user_id = ?',
            [postId, userId],
            callback
        );
    }
}

module.exports = Post; 