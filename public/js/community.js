// Modern Community Page Functionality
document.addEventListener('DOMContentLoaded', function() {
    const communitySearch = document.getElementById('communitySearch');
    const clearSearch = document.getElementById('clearSearch');
    const searchResults = document.getElementById('searchResults');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsCount = document.getElementById('resultsCount');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const trendingTags = document.querySelectorAll('.trending-tag');
    const openAiChat = document.getElementById('openAiChat');
    
    let searchTimeout;
    let currentFilter = 'all';
    
    // Search functionality
    if (communitySearch) {
        communitySearch.addEventListener('input', function() {
            const query = this.value.trim();
            
            // Show/hide clear button
            if (clearSearch) {
                clearSearch.style.display = query ? 'block' : 'none';
            }
            
            clearTimeout(searchTimeout);
            
            if (query.length < 2) {
                if (searchResults) {
                    searchResults.style.display = 'none';
                }
                return;
            }
            
            searchTimeout = setTimeout(() => {
                performSearch(query, currentFilter);
            }, 300);
        });
        
        communitySearch.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = this.value.trim();
                if (query) {
                    performSearch(query, currentFilter);
                }
            }
        });
    }
    
    // Clear search
    if (clearSearch) {
        clearSearch.addEventListener('click', function() {
            if (communitySearch) {
                communitySearch.value = '';
                this.style.display = 'none';
                if (searchResults) {
                    searchResults.style.display = 'none';
                }
                communitySearch.focus();
            }
        });
    }
    
    // Filter buttons
    filterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            filterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.getAttribute('data-filter');
            
            // Re-search with new filter if there's a query
            if (communitySearch && communitySearch.value.trim()) {
                performSearch(communitySearch.value.trim(), currentFilter);
            }
        });
    });
    
    // Trending hashtags
    trendingTags.forEach(tag => {
        tag.addEventListener('click', function() {
            const hashtag = this.getAttribute('data-hashtag');
            if (communitySearch) {
                communitySearch.value = `#${hashtag}`;
                if (clearSearch) {
                    clearSearch.style.display = 'block';
                }
                
                // Set filter to hashtags
                filterBtns.forEach(b => b.classList.remove('active'));
                const hashtagFilter = document.querySelector('[data-filter="hashtags"]');
                if (hashtagFilter) {
                    hashtagFilter.classList.add('active');
                }
                currentFilter = 'hashtags';
                
                performSearch(`#${hashtag}`, currentFilter);
            }
        });
    });
    
    // Perform search function
    function performSearch(query, filter) {
        if (!searchResults || !resultsContainer) return;
        
        // Show loading state
        searchResults.style.display = 'block';
        resultsContainer.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
        
        // Make API request
        fetch(`/api/community/search?q=${encodeURIComponent(query)}&filter=${filter}`)
            .then(response => response.json())
            .then(data => {
                displaySearchResults(data.results, data.count);
            })
            .catch(error => {
                console.error('Search error:', error);
                resultsContainer.innerHTML = '<div class="text-center p-4 text-danger"><i class="fas fa-exclamation-triangle me-2"></i>Error performing search. Please try again.</div>';
            });
    }
    
    // Display search results
    function displaySearchResults(results, count) {
        if (resultsCount) {
            resultsCount.textContent = `${count} result${count !== 1 ? 's' : ''}`;
        }
        
        if (!resultsContainer) return;
        
        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="text-center p-4">
                    <i class="fas fa-search-minus text-muted mb-3" style="font-size: 3rem;"></i>
                    <h5 class="text-muted">No results found</h5>
                    <p class="text-muted">Try different keywords or hashtags</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        results.forEach(result => {
            const iconText = getResultIconText(result.type);
            
            html += `
                <div class="search-result-item" onclick="handleResultClick('${result.type}', '${result.id}')">
                    <div class="result-icon ${result.type}">
                        ${iconText}
                    </div>
                    <div class="result-content">
                        <h6 class="result-title">${escapeHtml(result.title)}</h6>
                        <p class="result-description">${escapeHtml(result.description)}</p>
                        <div class="result-meta">
                            ${result.meta ? result.meta.map(m => `<span><i class="fas fa-info-circle me-1"></i>${m}</span>`).join('') : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        
        resultsContainer.innerHTML = html;
    }
    
    // Helper functions
    function getResultIconText(type) {
        const icons = {
            'post': '<i class="fas fa-file-alt"></i>',
            'hashtag': '#',
            'user': '<i class="fas fa-user"></i>',
            'goal': '<i class="fas fa-target"></i>'
        };
        return icons[type] || '<i class="fas fa-file-alt"></i>';
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Handle result clicks
    window.handleResultClick = function(type, id) {
        switch(type) {
            case 'post':
                window.location.href = `/community/post/${id}`;
                break;
            case 'hashtag':
                if (communitySearch) {
                    communitySearch.value = `#${id}`;
                    performSearch(`#${id}`, 'hashtags');
                }
                break;
            case 'user':
                showNotification('User Profiles', 'User profile pages will be available soon!', 'info');
                break;
            case 'goal':
                showNotification('Goal Details', 'Goal detail pages will be available soon!', 'info');
                break;
        }
    };
    
    // AI Assistant Chat Modal
    if (openAiChat) {
        openAiChat.addEventListener('click', function() {
            openAiChatModal();
        });
    }
    
    function openAiChatModal() {
        // Create AI chat modal
        const modalHtml = `
            <div class="modal fade" id="aiChatModal" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-lg modal-dialog-centered">
                    <div class="modal-content ai-chat-modal">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-robot me-2"></i>Goal Assistant AI
                                <span class="pro-badge ms-2">PRO</span>
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="chat-container" id="chatContainer">
                                <div class="ai-welcome-message">
                                    <div class="ai-avatar">
                                        <i class="fas fa-robot"></i>
                                    </div>
                                    <div class="ai-message">
                                        <p>Hello! I'm your Goal Assistant AI. I can help you with:</p>
                                        <ul>
                                            <li><strong>Creating SMART goals</strong> - Specific, Measurable, Achievable, Relevant, Time-bound</li>
                                            <li><strong>Breaking down complex goals</strong> into smaller milestones</li>
                                            <li><strong>Motivation and accountability tips</strong> to keep you on track</li>
                                            <li><strong>Overcoming obstacles</strong> and challenges you face</li>
                                            <li><strong>Time management</strong> and productivity advice</li>
                                        </ul>
                                        <p>What would you like help with today? 🎯</p>
                                    </div>
                                </div>
                            </div>
                            <div class="chat-input-container">
                                <div class="chat-input-wrapper">
                                    <input type="text" 
                                           class="chat-input" 
                                           id="chatInput" 
                                           placeholder="Ask me anything about your goals..."
                                           maxlength="500">
                                    <button class="chat-send-btn" id="chatSendBtn" disabled>
                                        <i class="fas fa-paper-plane"></i>
                                    </button>
                                </div>
                                <div class="chat-suggestions">
                                    <span class="suggestion-chip" data-suggestion="How do I create a SMART goal?">💡 SMART Goals</span>
                                    <span class="suggestion-chip" data-suggestion="I'm struggling with motivation, can you help?">🚀 Motivation Help</span>
                                    <span class="suggestion-chip" data-suggestion="How can I break down my big goals into smaller steps?">📋 Break Down Goals</span>
                                    <span class="suggestion-chip" data-suggestion="What are some good productivity tips?">⚡ Productivity Tips</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('aiChatModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('aiChatModal'));
        modal.show();
        
        // Initialize chat functionality
        initializeChatModal();
    }
    
    function initializeChatModal() {
        const chatInput = document.getElementById('chatInput');
        const chatSendBtn = document.getElementById('chatSendBtn');
        const chatContainer = document.getElementById('chatContainer');
        const suggestionChips = document.querySelectorAll('.suggestion-chip');
        
        // Enable/disable send button based on input
        if (chatInput && chatSendBtn) {
            chatInput.addEventListener('input', function() {
                const hasText = this.value.trim().length > 0;
                chatSendBtn.disabled = !hasText;
                chatSendBtn.style.opacity = hasText ? '1' : '0.5';
            });
        }
        
        // Send message function
        function sendMessage() {
            if (!chatInput || !chatSendBtn) return;
            
            const message = chatInput.value.trim();
            if (!message) return;
            
            // Disable send button
            chatSendBtn.disabled = true;
            chatSendBtn.style.opacity = '0.5';
            
            // Add user message
            addMessageToChat('user', message);
            chatInput.value = '';
            
            // Show typing indicator
            addTypingIndicator();
            
            // Send to AI API
            fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: message })
            })
            .then(response => response.json())
            .then(data => {
                removeTypingIndicator();
                chatSendBtn.disabled = false;
                chatSendBtn.style.opacity = '1';
                
                if (data.success) {
                    addMessageToChat('ai', data.response);
                } else if (data.upgrade) {
                    addMessageToChat('ai', '🔒 This feature requires a Pro subscription. Upgrade to unlock unlimited AI assistance!');
                } else {
                    addMessageToChat('ai', '😅 Sorry, I encountered an error. Please try again in a moment.');
                }
            })
            .catch(error => {
                removeTypingIndicator();
                chatSendBtn.disabled = false;
                chatSendBtn.style.opacity = '1';
                console.error('AI Chat error:', error);
                addMessageToChat('ai', '🔧 I\'m having trouble connecting right now. Please check your internet connection and try again.');
            });
        }
        
        // Event listeners
        if (chatSendBtn) {
            chatSendBtn.addEventListener('click', sendMessage);
        }
        
        if (chatInput) {
            chatInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }
        
        suggestionChips.forEach(chip => {
            chip.addEventListener('click', function() {
                const suggestion = this.getAttribute('data-suggestion');
                if (chatInput) {
                    chatInput.value = suggestion;
                    if (chatSendBtn) {
                        chatSendBtn.disabled = false;
                        chatSendBtn.style.opacity = '1';
                    }
                    sendMessage();
                }
            });
        });
        
        // Focus on input
        setTimeout(() => {
            if (chatInput) {
                chatInput.focus();
            }
        }, 300);
    }
    
    function addMessageToChat(sender, message) {
        const chatContainer = document.getElementById('chatContainer');
        if (!chatContainer) return;
        
        const messageHtml = `
            <div class="${sender}-message-wrapper">
                ${sender === 'ai' ? '<div class="ai-avatar"><i class="fas fa-robot"></i></div>' : ''}
                <div class="${sender}-message">
                    <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
                    <span class="message-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
            </div>
        `;
        chatContainer.insertAdjacentHTML('beforeend', messageHtml);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    function addTypingIndicator() {
        const chatContainer = document.getElementById('chatContainer');
        if (!chatContainer) return;
        
        const typingHtml = `
            <div class="ai-message-wrapper typing-indicator">
                <div class="ai-avatar">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="ai-message">
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            </div>
        `;
        chatContainer.insertAdjacentHTML('beforeend', typingHtml);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    function removeTypingIndicator() {
        const typingIndicator = document.querySelector('.typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }
    
    // Utility function to show notifications
    function showNotification(title, message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `custom-notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: white;
            border-radius: 12px;
            padding: 1rem 1.5rem;
            box-shadow: 0 15px 35px rgba(0,0,0,0.1);
            border-left: 4px solid ${type === 'success' ? '#10b981' : type === 'info' ? '#667eea' : type === 'warning' ? '#f59e0b' : '#ef4444'};
            z-index: 10000;
            transform: translateX(400px);
            transition: transform 0.4s ease;
            max-width: 320px;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
                <div style="flex-shrink: 0; font-size: 1.25rem;">
                    ${type === 'success' ? '✅' : type === 'info' ? 'ℹ️' : type === 'warning' ? '⚠️' : '❌'}
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 0.25rem; font-size: 0.9rem;">${title}</div>
                    <div style="font-size: 0.8rem; color: #6c757d; line-height: 1.4;">${message}</div>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 1.1rem; color: #6c757d; cursor: pointer; flex-shrink: 0;">×</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 400);
        }, 4000);
    }
    
    // Add entrance animations to post cards
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Observe all post cards for animation
    document.querySelectorAll('.post-card').forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
        observer.observe(card);
    });
    
    // Initialize like button functionality
    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const postId = this.getAttribute('data-post-id');
            const isLiked = this.classList.contains('liked');
            
            fetch(`/community/post/${postId}/like`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Update button state
                    this.classList.toggle('liked');
                    const icon = this.querySelector('i');
                    const text = this.querySelector('.action-text');
                    const likeCount = this.querySelector('.like-count');
                    
                    if (this.classList.contains('liked')) {
                        icon.className = 'fas fa-heart';
                        text.innerHTML = `Liked ${data.likeCount > 0 ? `<span class="like-count">(${data.likeCount})</span>` : ''}`;
                    } else {
                        icon.className = 'far fa-heart';
                        text.innerHTML = `Like ${data.likeCount > 0 ? `<span class="like-count">(${data.likeCount})</span>` : ''}`;
                    }
                    
                    // Add animation
                    this.style.transform = 'scale(1.1)';
                    setTimeout(() => {
                        this.style.transform = 'scale(1)';
                    }, 150);
                }
            })
            .catch(error => {
                console.error('Like error:', error);
                showNotification('Error', 'Failed to update like. Please try again.', 'error');
            });
        });
    });
    
    // Show welcome message for new features
    setTimeout(() => {
        if (!localStorage.getItem('hasSeenSearchFeatures')) {
            showNotification(
                'New Features! 🎉',
                'Try our powerful search with hashtag support and AI assistant for Pro members!',
                'success'
            );
            localStorage.setItem('hasSeenSearchFeatures', 'true');
        }
    }, 2000);
}); 