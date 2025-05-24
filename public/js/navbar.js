// Enhanced Navbar Functionality
class NavbarManager {
    constructor() {
        this.init();
        this.bindEvents();
    }

    init() {
        this.loadNotifications();
        this.initAIAssistant();
        this.initMobileMenu();
        
        // Load notification count and recent notifications on page load
        this.updateNotificationCount();
        this.loadRecentNotifications();
        
        // Check for new notifications every 30 seconds
        setInterval(() => {
            this.updateNotificationCount();
            this.loadRecentNotifications();
        }, 30000);
    }

    bindEvents() {
        // Wait for DOM to be fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.bindEvents());
            return;
        }

        console.log('🔧 Binding navbar events...');

        // Notification dropdown toggle
        const notificationBtn = document.querySelector('.notification-btn');
        console.log('📱 Notification button found:', !!notificationBtn);
        
        if (notificationBtn) {
            notificationBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔔 Notification button clicked');
                this.toggleNotifications();
            });
        }

        // AI Assistant button
        const aiBtn = document.querySelector('.ai-assistant-btn');
        console.log('🤖 AI button found:', !!aiBtn);
        if (aiBtn) {
            aiBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleAIAssistant();
            });
        }

        // User dropdown toggle - Try multiple selectors
        const userBtn = document.querySelector('.user-btn') || 
                       document.querySelector('.user-profile') || 
                       document.querySelector('#userProfileBtn');
        
        console.log('👤 User button found:', !!userBtn);
        console.log('👤 User button classes:', userBtn ? userBtn.className : 'not found');
        console.log('👤 User button ID:', userBtn ? userBtn.id : 'not found');
        
        if (userBtn) {
            // Remove any existing listeners first
            userBtn.removeEventListener('click', this.handleUserClick);
            
            // Add new listener
            this.handleUserClick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('👤 User button clicked!');
                this.toggleUserDropdown();
            };
            
            userBtn.addEventListener('click', this.handleUserClick);
            console.log('✅ User dropdown event listener added');
        } else {
            console.error('❌ User button not found! Available elements:');
            console.log('- .user-btn:', document.querySelector('.user-btn'));
            console.log('- .user-profile:', document.querySelector('.user-profile'));
            console.log('- #userProfileBtn:', document.querySelector('#userProfileBtn'));
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.navbar-dropdown')) {
                this.closeAllDropdowns();
            }
        });

        // Mobile menu toggle
        const mobileToggle = document.querySelector('.mobile-menu-toggle');
        if (mobileToggle) {
            mobileToggle.addEventListener('click', () => {
                this.toggleMobileMenu();
            });
        }

        // Mark all notifications as read
        document.addEventListener('click', (e) => {
            if (e.target.closest('.mark-all-read-btn')) {
                e.preventDefault();
                this.markAllNotificationsRead();
            }
        });

        // Individual notification click
        document.addEventListener('click', (e) => {
            const notificationItem = e.target.closest('.notification-item');
            if (notificationItem) {
                this.handleNotificationClick(notificationItem);
            }
        });
    }

    initAIAssistant() {
        // Create AI chat modal if it doesn't exist
        if (!document.querySelector('#aiChatModal')) {
            this.createAIChatModal();
        }
    }

    createAIChatModal() {
        const modalHTML = `
            <div class="modal fade" id="aiChatModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-robot me-2"></i>
                                AI Goal Assistant
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div id="chatMessages" class="chat-messages mb-3"></div>
                            <div class="input-group">
                                <input type="text" 
                                       class="form-control" 
                                       id="aiChatInput" 
                                       placeholder="Ask me about your goals..."
                                       maxlength="500">
                                <button class="btn btn-primary" id="sendMessageBtn">
                                    <i class="fas fa-paper-plane"></i>
                                </button>
                            </div>
                            <div class="chat-info mt-2">
                                <small class="text-muted">
                                    <i class="fas fa-crown me-1"></i>
                                    Pro feature - AI assistance for goal planning and motivation
                                </small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.bindAIChatEvents();
    }

    bindAIChatEvents() {
        const chatInput = document.getElementById('aiChatInput');
        const sendBtn = document.getElementById('sendMessageBtn');
        const chatMessages = document.getElementById('chatMessages');

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendAIMessage());
        }

        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendAIMessage();
                }
            });
        }
    }

    async sendAIMessage() {
        const input = document.getElementById('aiChatInput');
        const chatMessages = document.getElementById('chatMessages');
        const sendBtn = document.getElementById('sendMessageBtn');
        
        const message = input.value.trim();
        if (!message) return;

        // Add user message to chat
        this.addMessageToChat('user', message);
        input.value = '';
        sendBtn.disabled = true;

        // Add typing indicator
        this.addTypingIndicator();

        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message })
            });

            const data = await response.json();
            this.removeTypingIndicator();

            if (data.success) {
                this.addMessageToChat('ai', data.response);
            } else if (data.upgrade) {
                this.addMessageToChat('system', 'Please upgrade to Pro to use AI assistance! 🌟');
            } else {
                this.addMessageToChat('system', data.error || 'Sorry, I encountered an error.');
            }
        } catch (error) {
            this.removeTypingIndicator();
            this.addMessageToChat('system', 'Connection error. Please try again.');
        }

        sendBtn.disabled = false;
    }

    addMessageToChat(type, message) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}-message`;
        
        const icon = type === 'user' ? '👤' : type === 'ai' ? '🤖' : 'ℹ️';
        messageDiv.innerHTML = `
            <div class="message-icon">${icon}</div>
            <div class="message-content">${message}</div>
        `;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    addTypingIndicator() {
        const chatMessages = document.getElementById('chatMessages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'chat-message ai-message typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-icon">🤖</div>
            <div class="message-content">
                <div class="typing-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    removeTypingIndicator() {
        const typingIndicator = document.querySelector('.typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    toggleUserDropdown() {
        // Try multiple selectors for the dropdown
        const dropdown = document.querySelector('.user-dropdown') || 
                        document.querySelector('#userDropdown') ||
                        document.querySelector('.navbar-dropdown');
        
        const userBtn = document.querySelector('.user-btn') || 
                       document.querySelector('.user-profile') || 
                       document.querySelector('#userProfileBtn');
        
        console.log('🔍 Toggle user dropdown called');
        console.log('📋 Dropdown element found:', !!dropdown);
        console.log('📋 Dropdown classes:', dropdown ? dropdown.className : 'not found');
        console.log('👤 User button found:', !!userBtn);
        
        if (!dropdown) {
            console.error('❌ Dropdown element not found! Available dropdowns:');
            console.log('- .user-dropdown:', document.querySelector('.user-dropdown'));
            console.log('- #userDropdown:', document.querySelector('#userDropdown'));
            console.log('- .navbar-dropdown:', document.querySelectorAll('.navbar-dropdown'));
            return;
        }
        
        const isOpen = dropdown.classList.contains('show');
        console.log('📊 Dropdown current state - isOpen:', isOpen);
        
        // Close all dropdowns first
        this.closeAllDropdowns();
        
        // Toggle the dropdown
        if (!isOpen) {
            dropdown.classList.add('show');
            if (userBtn) {
                userBtn.classList.add('open');
            }
            
            console.log('✅ Dropdown opened');
            console.log('📋 Dropdown classes after opening:', dropdown.className);
            
            // Force visibility with inline styles as backup
            dropdown.style.opacity = '1';
            dropdown.style.visibility = 'visible';
            dropdown.style.transform = 'translateY(0)';
        } else {
            console.log('🔄 Dropdown was already open, now closing');
        }
    }

    toggleAIAssistant() {
        const modal = document.querySelector('#aiChatModal');
        if (modal) {
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
        }
    }

    closeAllDropdowns() {
        document.querySelectorAll('.navbar-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
        
        // Also remove open state from user button
        const userBtn = document.querySelector('.user-btn');
        if (userBtn) {
            userBtn.classList.remove('open');
        }
    }

    toggleMobileMenu() {
        const navbar = document.querySelector('.navbar-collapse');
        if (navbar) {
            navbar.classList.toggle('show');
        }
    }

    initMobileMenu() {
        // Handle mobile menu animations
        const mobileToggle = document.querySelector('.mobile-menu-toggle');
        if (mobileToggle) {
            mobileToggle.addEventListener('click', () => {
                mobileToggle.classList.toggle('active');
            });
        }
    }

    async loadNotifications() {
        try {
            const response = await fetch('/api/notifications');
            const data = await response.json();
            
            if (data.success) {
                this.updateNotificationUI(data.notifications, data.unreadCount);
            }
        } catch (error) {
            console.error('Error loading notifications:', error);
            // Show empty state instead of fake notifications
            this.updateNotificationUI([], 0);
        }
    }

    updateNotificationUI(notifications, unreadCount) {
        // Update notification badge
        const badge = document.querySelector('.notification-badge');
        const counter = document.querySelector('.notification-count');
        
        if (badge && counter) {
            if (unreadCount > 0) {
                badge.style.display = 'flex';
                counter.textContent = unreadCount > 99 ? '99+' : unreadCount;
            } else {
                badge.style.display = 'none';
            }
        }

        // Update notification dropdown content
        const notificationsList = document.querySelector('.notifications-list');
        if (notificationsList) {
            if (notifications.length === 0) {
                notificationsList.innerHTML = `
                    <div class="empty-notifications">
                        <i class="fas fa-bell-slash"></i>
                        <p>No notifications yet</p>
                    </div>
                `;
            } else {
                notificationsList.innerHTML = notifications.map(notification => {
                    // Use database icon instead of hardcoded emoji
                    const iconClass = notification.icon || 'fa-bell';
                    const iconHtml = `<i class="fas ${iconClass}" style="color: #667eea; font-size: 1.2rem;"></i>`;
                    
                    return `
                        <div class="notification-item ${notification.is_read ? 'read' : 'unread'}" 
                             data-id="${notification.id}" 
                             data-url="${notification.action_url || ''}">
                            <div class="notification-icon">${iconHtml}</div>
                            <div class="notification-content">
                                <div class="notification-title">${notification.title}</div>
                                <div class="notification-message">${notification.message || notification.content}</div>
                                <div class="notification-time">${this.formatTime(notification.created_at)}</div>
                            </div>
                            ${!notification.is_read ? '<div class="unread-dot"></div>' : ''}
                        </div>
                    `;
                }).join('');
            }

            // Update mark all as read button visibility
            const markAllBtn = document.querySelector('.mark-all-read-btn');
            if (markAllBtn) {
                markAllBtn.style.display = unreadCount > 0 ? 'block' : 'none';
            }
        }
    }

    formatTime(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diffMs = now - time;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return time.toLocaleDateString();
    }

    toggleNotifications() {
        const dropdown = document.querySelector('.notification-dropdown');
        const isOpen = dropdown && dropdown.classList.contains('show');
        
        this.closeAllDropdowns();
        
        if (!isOpen && dropdown) {
            dropdown.classList.add('show');
            this.loadNotifications(); // Refresh notifications when opened
        }
    }

    async markAllNotificationsRead() {
        try {
            const response = await fetch('/api/notifications/mark-all-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                this.loadNotifications();
            }
        } catch (error) {
            console.error('Error marking notifications as read:', error);
        }
    }

    async handleNotificationClick(notificationItem) {
        const notificationId = notificationItem.dataset.id;
        const actionUrl = notificationItem.dataset.url;
        const isUnread = notificationItem.classList.contains('unread');

        // Mark as read if unread
        if (isUnread) {
            try {
                await fetch(`/api/notifications/${notificationId}/read`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (error) {
                console.error('Error marking notification as read:', error);
            }
        }

        // Navigate to action URL if available
        if (actionUrl) {
            window.location.href = actionUrl;
        }
    }

    updateNotificationCount() {
        fetch('/api/notifications/unread-count')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const badge = document.querySelector('.notification-badge');
                    const countElement = document.querySelector('.notification-count');
                    
                    if (badge && countElement) {
                        if (data.count > 0) {
                            badge.style.display = 'flex';
                            countElement.textContent = data.count > 99 ? '99+' : data.count;
                        } else {
                            badge.style.display = 'none';
                        }
                    }
                }
            })
            .catch(error => {
                console.warn('Error updating notification count:', error);
            });
    }

    loadRecentNotifications() {
        fetch('/api/notifications/recent?limit=5')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.renderNotifications(data.notifications);
                }
            })
            .catch(error => {
                console.warn('Error loading recent notifications:', error);
            });
    }

    renderNotifications(notifications) {
        const notificationsList = document.querySelector('.notifications-list');
        if (!notificationsList) return;

        if (notifications.length === 0) {
            notificationsList.innerHTML = `
                <div class="empty-notifications" style="padding: 2rem; text-align: center; color: #6c757d;">
                    <i class="fas fa-bell-slash" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <p style="margin: 0; font-size: 0.9rem;">No notifications yet</p>
                </div>
            `;
            return;
        }

        const notificationsHTML = notifications.map(notification => {
            const timeAgo = this.formatTime(notification.created_at);
            const isUnread = notification.is_read === 0;
            
            // Use the database icon (FontAwesome class) instead of hardcoded emoji
            const iconClass = notification.icon || 'fa-bell';
            const iconHtml = `<i class="fas ${iconClass}" style="color: #667eea; font-size: 1.2rem;"></i>`;
            
            // Safely handle notification fields to prevent "undefined"
            const title = notification.title || 'Notification';
            const content = notification.content || notification.message || 'New notification';
            
            return `
                <div class="notification-item ${isUnread ? 'unread' : ''}" data-notification-id="${notification.id}">
                    <div class="notification-icon">${iconHtml}</div>
                    <div class="notification-content">
                        <p style="margin: 0; font-weight: 600; font-size: 0.9rem; color: #2c3e50;">${title}</p>
                        <p style="margin: 0.2rem 0 0 0; font-size: 0.8rem; color: #6c757d; line-height: 1.3;">${content}</p>
                        <div class="notification-time" style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.3rem;">${timeAgo}</div>
                    </div>
                    ${isUnread ? '<div class="unread-indicator" style="width: 8px; height: 8px; background: #667eea; border-radius: 50%; margin-left: auto; flex-shrink: 0;"></div>' : ''}
                </div>
            `;
        }).join('');

        notificationsList.innerHTML = notificationsHTML;

        // Add click handlers to mark notifications as read
        notificationsList.querySelectorAll('.notification-item.unread').forEach(item => {
            item.addEventListener('click', () => {
                const notificationId = item.dataset.notificationId;
                this.markNotificationAsRead(notificationId);
                item.classList.remove('unread');
                item.querySelector('.unread-indicator')?.remove();
                this.updateNotificationCount(); // Refresh count
            });
        });
    }

    markNotificationAsRead(notificationId) {
        fetch(`/api/notifications/${notificationId}/mark-read`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }).catch(error => {
            console.warn('Error marking notification as read:', error);
        });
    }
}

// Initialize navbar when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new NavbarManager();
});

// Enhanced CSS for chat functionality
const additionalStyles = `
<style>
.chat-messages {
    max-height: 400px;
    overflow-y: auto;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 10px;
}

.chat-message {
    display: flex;
    margin-bottom: 1rem;
    animation: fadeInUp 0.3s ease;
}

.chat-message.user-message {
    justify-content: flex-end;
}

.chat-message.user-message .message-content {
    background: #667eea;
    color: white;
    margin-left: 2rem;
}

.chat-message.ai-message .message-content {
    background: white;
    color: #333;
    margin-right: 2rem;
}

.chat-message.system-message .message-content {
    background: #ffc107;
    color: #212529;
    margin: 0 2rem;
    text-align: center;
}

.message-content {
    padding: 0.75rem 1rem;
    border-radius: 18px;
    max-width: 70%;
    word-wrap: break-word;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.message-icon {
    font-size: 1.5rem;
    margin: 0 0.5rem;
    align-self: flex-end;
}

.typing-dots {
    display: flex;
    gap: 4px;
}

.typing-dots span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #667eea;
    animation: typing 1.4s infinite ease-in-out;
}

.typing-dots span:nth-child(1) { animation-delay: -0.32s; }
.typing-dots span:nth-child(2) { animation-delay: -0.16s; }

@keyframes typing {
    0%, 80%, 100% {
        transform: scale(0);
        opacity: 0.5;
    }
    40% {
        transform: scale(1);
        opacity: 1;
    }
}

@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.empty-notifications {
    text-align: center;
    padding: 2rem;
    color: #6c757d;
}

.empty-notifications i {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.5;
}

.notification-item {
    display: flex;
    padding: 1rem;
    border-bottom: 1px solid #eee;
    cursor: pointer;
    transition: background-color 0.2s;
    position: relative;
}

.notification-item:hover {
    background-color: #f8f9fa;
}

.notification-item.unread {
    background-color: #f0f4ff;
}

.notification-item .notification-icon {
    font-size: 1.5rem;
    margin-right: 1rem;
    align-self: center;
}

.notification-item .notification-content {
    flex: 1;
}

.notification-item .notification-title {
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: #2c3e50;
}

.notification-item .notification-message {
    font-size: 0.9rem;
    color: #6c757d;
    margin-bottom: 0.25rem;
}

.notification-item .notification-time {
    font-size: 0.8rem;
    color: #9ca3af;
}

.unread-dot {
    width: 8px;
    height: 8px;
    background: #667eea;
    border-radius: 50%;
    position: absolute;
    top: 1rem;
    right: 1rem;
}

.chat-info {
    background: #e3f2fd;
    padding: 0.5rem;
    border-radius: 5px;
    text-align: center;
}
</style>
`;

// Add styles to document
document.head.insertAdjacentHTML('beforeend', additionalStyles); 