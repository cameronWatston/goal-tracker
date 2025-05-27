const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { isAuthenticated } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(isAuthenticated);

// ======================== USER SEARCH ========================

// Search for users
router.get('/search', (req, res) => {
    const { q } = req.query;
    const userId = req.session.user.id;
    
    if (!q || q.trim().length < 2) {
        return res.json({ users: [] });
    }
    
    const searchTerm = `%${q.trim()}%`;
    
    db.all(`
        SELECT 
            u.id,
            u.username,
            u.email,
            u.created_at,
            CASE 
                WHEN uf1.status = 'accepted' THEN 'friends'
                WHEN uf1.status = 'pending' AND uf1.user_id = ? THEN 'request_sent'
                WHEN uf1.status = 'pending' AND uf1.friend_id = ? THEN 'request_received'
                ELSE 'none'
            END as friendship_status
        FROM users u
        LEFT JOIN user_friends uf1 ON (
            (uf1.user_id = ? AND uf1.friend_id = u.id) OR 
            (uf1.friend_id = ? AND uf1.user_id = u.id)
        )
        WHERE u.id != ? 
        AND (u.username LIKE ? OR u.email LIKE ?)
        ORDER BY u.username
        LIMIT 20
    `, [userId, userId, userId, userId, userId, searchTerm, searchTerm], (err, users) => {
        if (err) {
            console.error('Error searching users:', err);
            return res.status(500).json({ error: 'Failed to search users' });
        }
        
        res.json({ users });
    });
});

// ======================== FRIEND MANAGEMENT ========================

// Get user's friends list
router.get('/friends', (req, res) => {
    const userId = req.session.user.id;
    
    db.all(`
        SELECT 
            u.id,
            u.username,
            u.email,
            u.created_at,
            uf.created_at as friendship_date,
            uf.status
        FROM user_friends uf
        JOIN users u ON (
            CASE 
                WHEN uf.user_id = ? THEN u.id = uf.friend_id
                ELSE u.id = uf.user_id
            END
        )
        WHERE (uf.user_id = ? OR uf.friend_id = ?) 
        AND uf.status = 'accepted'
        ORDER BY uf.created_at DESC
    `, [userId, userId, userId], (err, friends) => {
        if (err) {
            console.error('Error fetching friends:', err);
            return res.status(500).json({ error: 'Failed to fetch friends' });
        }
        
        res.json({ friends });
    });
});

// Get pending friend requests
router.get('/friend-requests', (req, res) => {
    const userId = req.session.user.id;
    
    // Get incoming requests
    db.all(`
        SELECT 
            uf.id as request_id,
            u.id,
            u.username,
            u.email,
            uf.created_at as request_date,
            'incoming' as type
        FROM user_friends uf
        JOIN users u ON u.id = uf.user_id
        WHERE uf.friend_id = ? AND uf.status = 'pending'
        
        UNION ALL
        
        SELECT 
            uf.id as request_id,
            u.id,
            u.username,
            u.email,
            uf.created_at as request_date,
            'outgoing' as type
        FROM user_friends uf
        JOIN users u ON u.id = uf.friend_id
        WHERE uf.user_id = ? AND uf.status = 'pending'
        
        ORDER BY request_date DESC
    `, [userId, userId], (err, requests) => {
        if (err) {
            console.error('Error fetching friend requests:', err);
            return res.status(500).json({ error: 'Failed to fetch friend requests' });
        }
        
        res.json({ requests });
    });
});

// Send friend request
router.post('/friend-request', (req, res) => {
    const { friendId } = req.body;
    const userId = req.session.user.id;
    
    if (!friendId || friendId == userId) {
        return res.status(400).json({ error: 'Invalid friend ID' });
    }
    
    // Check if friendship already exists
    db.get(`
        SELECT * FROM user_friends 
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    `, [userId, friendId, friendId, userId], (err, existing) => {
        if (err) {
            console.error('Error checking existing friendship:', err);
            return res.status(500).json({ error: 'Failed to send friend request' });
        }
        
        if (existing) {
            return res.status(400).json({ error: 'Friend request already exists' });
        }
        
        // Create friend request
        db.run(`
            INSERT INTO user_friends (user_id, friend_id, status)
            VALUES (?, ?, 'pending')
        `, [userId, friendId], function(err) {
            if (err) {
                console.error('Error creating friend request:', err);
                return res.status(500).json({ error: 'Failed to send friend request' });
            }
            
            // Create notification for the recipient
            db.get('SELECT username FROM users WHERE id = ?', [userId], (err, sender) => {
                if (!err && sender) {
                    db.run(`
                        INSERT INTO notifications (user_id, type, title, message, data)
                        VALUES (?, 'friend_request', 'New Friend Request', ?, ?)
                    `, [
                        friendId, 
                        `${sender.username} sent you a friend request`,
                        JSON.stringify({ requestId: this.lastID, senderId: userId })
                    ]);
                }
            });
            
            res.json({ success: true, message: 'Friend request sent successfully' });
        });
    });
});

// Accept/decline friend request
router.put('/friend-request/:requestId', (req, res) => {
    const { requestId } = req.params;
    const { action } = req.body; // 'accept' or 'decline'
    const userId = req.session.user.id;
    
    if (!['accept', 'decline'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
    }
    
    // Verify the request belongs to the user
    db.get(`
        SELECT * FROM user_friends 
        WHERE id = ? AND friend_id = ? AND status = 'pending'
    `, [requestId, userId], (err, request) => {
        if (err) {
            console.error('Error fetching friend request:', err);
            return res.status(500).json({ error: 'Failed to process friend request' });
        }
        
        if (!request) {
            return res.status(404).json({ error: 'Friend request not found' });
        }
        
        if (action === 'accept') {
            // Accept the request
            db.run(`
                UPDATE user_friends 
                SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [requestId], (err) => {
                if (err) {
                    console.error('Error accepting friend request:', err);
                    return res.status(500).json({ error: 'Failed to accept friend request' });
                }
                
                // Create notification for the sender
                db.get('SELECT username FROM users WHERE id = ?', [userId], (err, accepter) => {
                    if (!err && accepter) {
                        db.run(`
                            INSERT INTO notifications (user_id, type, title, message, data)
                            VALUES (?, 'friend_accepted', 'Friend Request Accepted', ?, ?)
                        `, [
                            request.user_id,
                            `${accepter.username} accepted your friend request`,
                            JSON.stringify({ friendId: userId })
                        ]);
                    }
                });
                
                res.json({ success: true, message: 'Friend request accepted' });
            });
        } else {
            // Decline the request
            db.run('DELETE FROM user_friends WHERE id = ?', [requestId], (err) => {
                if (err) {
                    console.error('Error declining friend request:', err);
                    return res.status(500).json({ error: 'Failed to decline friend request' });
                }
                
                res.json({ success: true, message: 'Friend request declined' });
            });
        }
    });
});

// Remove friend
router.delete('/friend/:friendId', (req, res) => {
    const { friendId } = req.params;
    const userId = req.session.user.id;
    
    db.run(`
        DELETE FROM user_friends 
        WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        AND status = 'accepted'
    `, [userId, friendId, friendId, userId], function(err) {
        if (err) {
            console.error('Error removing friend:', err);
            return res.status(500).json({ error: 'Failed to remove friend' });
        }
        
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Friendship not found' });
        }
        
        res.json({ success: true, message: 'Friend removed successfully' });
    });
});

// ======================== PRIVATE MESSAGING ========================

// Get conversations list
router.get('/conversations', (req, res) => {
    const userId = req.session.user.id;
    
    db.all(`
        SELECT 
            CASE 
                WHEN pm.sender_id = ? THEN pm.receiver_id 
                ELSE pm.sender_id 
            END as other_user_id,
            u.username as other_username,
            u.email as other_email,
            pm.message as last_message,
            pm.created_at as last_message_time,
            COUNT(CASE WHEN pm.receiver_id = ? AND pm.is_read = 0 THEN 1 END) as unread_count
        FROM private_messages pm
        JOIN users u ON u.id = CASE 
            WHEN pm.sender_id = ? THEN pm.receiver_id 
            ELSE pm.sender_id 
        END
        WHERE pm.sender_id = ? OR pm.receiver_id = ?
        GROUP BY other_user_id
        ORDER BY last_message_time DESC
    `, [userId, userId, userId, userId, userId], (err, conversations) => {
        if (err) {
            console.error('Error fetching conversations:', err);
            return res.status(500).json({ error: 'Failed to fetch conversations' });
        }
        
        res.json({ conversations });
    });
});

// Get messages in a conversation
router.get('/messages/:otherUserId', (req, res) => {
    const { otherUserId } = req.params;
    const userId = req.session.user.id;
    const { page = 1, limit = 50 } = req.query;
    
    const offset = (page - 1) * limit;
    
    db.all(`
        SELECT 
            pm.*,
            sender.username as sender_username,
            receiver.username as receiver_username,
            CASE WHEN pm.sender_id = ? THEN 1 ELSE 0 END as is_sender
        FROM private_messages pm
        JOIN users sender ON sender.id = pm.sender_id
        JOIN users receiver ON receiver.id = pm.receiver_id
        WHERE (pm.sender_id = ? AND pm.receiver_id = ?) 
           OR (pm.sender_id = ? AND pm.receiver_id = ?)
        ORDER BY pm.created_at DESC
        LIMIT ? OFFSET ?
    `, [userId, userId, otherUserId, otherUserId, userId, limit, offset], (err, messages) => {
        if (err) {
            console.error('Error fetching messages:', err);
            return res.status(500).json({ error: 'Failed to fetch messages' });
        }
        
        // Mark messages as read
        db.run(`
            UPDATE private_messages 
            SET is_read = 1 
            WHERE sender_id = ? AND receiver_id = ? AND is_read = 0
        `, [otherUserId, userId]);
        
        res.json({ messages: messages.reverse() });
    });
});

// Send a private message
router.post('/message', (req, res) => {
    const { receiverId, message } = req.body;
    const userId = req.session.user.id;
    
    if (!receiverId || !message || message.trim().length === 0) {
        return res.status(400).json({ error: 'Receiver ID and message are required' });
    }
    
    if (receiverId == userId) {
        return res.status(400).json({ error: 'Cannot send message to yourself' });
    }
    
    // Check if users are friends
    db.get(`
        SELECT * FROM user_friends 
        WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        AND status = 'accepted'
    `, [userId, receiverId, receiverId, userId], (err, friendship) => {
        if (err) {
            console.error('Error checking friendship:', err);
            return res.status(500).json({ error: 'Failed to send message' });
        }
        
        if (!friendship) {
            return res.status(403).json({ error: 'You can only message friends' });
        }
        
        // Send the message
        db.run(`
            INSERT INTO private_messages (sender_id, receiver_id, message, created_at)
            VALUES (?, ?, ?, ?)
        `, [userId, receiverId, message.trim(), new Date().toISOString()], function(err) {
            if (err) {
                console.error('Error sending message:', err);
                return res.status(500).json({ error: 'Failed to send message' });
            }
            
            // Create notification for the receiver
            db.get('SELECT username FROM users WHERE id = ?', [userId], (err, sender) => {
                if (!err && sender) {
                    db.run(`
                        INSERT INTO notifications (user_id, type, title, message, data)
                        VALUES (?, 'private_message', 'New Message', ?, ?)
                    `, [
                        receiverId,
                        `${sender.username} sent you a message`,
                        JSON.stringify({ messageId: this.lastID, senderId: userId })
                    ]);
                }
            });
            
            res.json({ 
                success: true, 
                message: 'Message sent successfully',
                messageId: this.lastID
            });
        });
    });
});

// ======================== NOTIFICATIONS ========================

// Get user notifications
router.get('/notifications', (req, res) => {
    const userId = req.session.user.id;
    const { limit = 20, offset = 0 } = req.query;
    
    db.all(`
        SELECT * FROM notifications 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
    `, [userId, limit, offset], (err, notifications) => {
        if (err) {
            console.error('Error fetching notifications:', err);
            return res.status(500).json({ error: 'Failed to fetch notifications' });
        }
        
        res.json({ notifications });
    });
});

// Mark notification as read
router.put('/notifications/:notificationId/read', (req, res) => {
    const { notificationId } = req.params;
    const userId = req.session.user.id;
    
    db.run(`
        UPDATE notifications 
        SET is_read = 1 
        WHERE id = ? AND user_id = ?
    `, [notificationId, userId], function(err) {
        if (err) {
            console.error('Error marking notification as read:', err);
            return res.status(500).json({ error: 'Failed to mark notification as read' });
        }
        
        res.json({ success: true });
    });
});

// Mark all notifications as read
router.put('/notifications/mark-all-read', (req, res) => {
    const userId = req.session.user.id;
    
    db.run(`
        UPDATE notifications 
        SET is_read = 1 
        WHERE user_id = ? AND is_read = 0
    `, [userId], function(err) {
        if (err) {
            console.error('Error marking all notifications as read:', err);
            return res.status(500).json({ error: 'Failed to mark notifications as read' });
        }
        
        res.json({ success: true, updated: this.changes });
    });
});

// Get unread notification count
router.get('/notifications/unread-count', (req, res) => {
    const userId = req.session.user.id;
    
    db.get(`
        SELECT COUNT(*) as count FROM notifications 
        WHERE user_id = ? AND is_read = 0
    `, [userId], (err, result) => {
        if (err) {
            console.error('Error fetching unread count:', err);
            return res.status(500).json({ error: 'Failed to fetch unread count' });
        }
        
        res.json({ count: result.count });
    });
});

// ======================== ADDITIONAL ENDPOINTS FOR FRIENDS/MESSAGES PAGES ========================

// Get user info by ID (for starting conversations)
router.get('/user/:userId', (req, res) => {
    const { userId } = req.params;
    const currentUserId = req.session.user.id;
    
    db.get(`
        SELECT 
            u.id,
            u.username,
            u.created_at,
            CASE 
                WHEN uf1.status = 'accepted' THEN 'friends'
                WHEN uf1.status = 'pending' AND uf1.user_id = ? THEN 'request_sent'
                WHEN uf1.status = 'pending' AND uf1.friend_id = ? THEN 'request_received'
                ELSE 'none'
            END as friendship_status
        FROM users u
        LEFT JOIN user_friends uf1 ON (
            (uf1.user_id = ? AND uf1.friend_id = u.id) OR 
            (uf1.friend_id = ? AND uf1.user_id = u.id)
        )
        WHERE u.id = ?
    `, [currentUserId, currentUserId, currentUserId, currentUserId, userId], (err, user) => {
        if (err) {
            console.error('Error fetching user:', err);
            return res.status(500).json({ error: 'Failed to fetch user' });
        }
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ user });
    });
});

// Get message statistics
router.get('/message-stats', (req, res) => {
    const userId = req.session.user.id;
    
    // Get total messages sent by user
    db.get(`
        SELECT COUNT(*) as total FROM private_messages 
        WHERE sender_id = ?
    `, [userId], (err, totalResult) => {
        if (err) {
            console.error('Error fetching message stats:', err);
            return res.status(500).json({ error: 'Failed to fetch message stats' });
        }
        
        // Get average response time (simplified)
        db.get(`
            SELECT COUNT(*) as conversations FROM (
                SELECT DISTINCT 
                    CASE 
                        WHEN sender_id = ? THEN receiver_id 
                        ELSE sender_id 
                    END as other_user
                FROM private_messages 
                WHERE sender_id = ? OR receiver_id = ?
            )
        `, [userId, userId, userId], (err, convResult) => {
            if (err) {
                console.error('Error fetching conversation stats:', err);
                return res.status(500).json({ error: 'Failed to fetch conversation stats' });
            }
            
            res.json({ 
                stats: {
                    total: totalResult.total,
                    conversations: convResult.conversations,
                    avgResponse: convResult.conversations > 0 ? '< 1h' : '--'
                }
            });
        });
    });
});



module.exports = router; 