// Premium Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
    setupEventListeners();
    loadDashboardData();
});

let currentStep = 1;
let generatedMilestones = [];
let aiConversationHistory = [];

// ======================== INITIALIZATION ========================

function initializeDashboard() {
    console.log('🎯 Initializing Premium Dashboard...');
    
    // Load user streak
    loadUserStreak();
    
    // Load milestone counts
    loadMilestoneCounts();
    
    // Calculate completion rate
    calculateCompletionRate();
    
    // Setup greeting and motivational quote
    updateGreeting();
    loadMotivationalQuote();
    
    // Setup goal filtering
    setupGoalFiltering();
    
    // Initialize AI assistant
    initializeAIAssistant();
    
    // Load analytics if premium
    if (isPremiumUser()) {
        loadPremiumAnalytics();
    }
}

function setupEventListeners() {
    // Goal creation wizard
    document.getElementById('nextStep')?.addEventListener('click', nextWizardStep);
    document.getElementById('prevStep')?.addEventListener('click', prevWizardStep);
    document.getElementById('createGoal')?.addEventListener('click', createGoalWithMilestones);
    
    // AI Assistant
    document.getElementById('aiSendBtn')?.addEventListener('click', sendAIMessage);
    document.getElementById('aiInput')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendAIMessage();
    });
    
    // AI Suggestions
    document.querySelectorAll('.ai-suggestion').forEach(btn => {
        btn.addEventListener('click', function() {
            const suggestion = this.getAttribute('data-suggestion');
            document.getElementById('aiInput').value = suggestion;
            sendAIMessage();
        });
    });
    
    // Goal actions
    document.querySelectorAll('.view-goal-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const goalId = this.getAttribute('data-goal-id');
            viewGoalDetails(goalId);
        });
    });
    
    document.querySelectorAll('.edit-goal-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const goalId = this.getAttribute('data-goal-id');
            editGoal(goalId);
        });
    });
    
    document.querySelectorAll('.delete-goal-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const goalId = this.getAttribute('data-goal-id');
            deleteGoal(goalId);
        });
    });
    
    // Milestone actions
    document.getElementById('regenerateMilestones')?.addEventListener('click', regenerateMilestones);
    document.getElementById('addCustomMilestone')?.addEventListener('click', addCustomMilestone);
}

// ======================== DATA LOADING ========================

async function loadDashboardData() {
    try {
        // Load goal progress for each card
        const goalCards = document.querySelectorAll('.goal-card');
        for (const card of goalCards) {
            const goalId = card.getAttribute('data-goal-id');
            await loadGoalProgress(goalId, card);
        }
        
        // Update stats
        updateQuickStats();
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

async function loadGoalProgress(goalId, card) {
    try {
        const response = await fetch(`/api/goals/${goalId}/progress`);
        const data = await response.json();
        
        if (data.success) {
            const progressBar = card.querySelector('.progress-bar');
            const progressPercentage = card.querySelector('.progress-percentage');
            const milestoneCount = card.querySelector('.milestone-count');
            
            progressBar.style.width = `${data.progress}%`;
            progressPercentage.textContent = `${data.progress}%`;
            milestoneCount.textContent = data.milestoneCount || 0;
        }
    } catch (error) {
        console.error('Error loading goal progress:', error);
    }
}

async function loadUserStreak() {
    try {
        const response = await fetch('/api/user/streak');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('streak-count').textContent = data.streak || 0;
        }
    } catch (error) {
        console.error('Error loading user streak:', error);
        document.getElementById('streak-count').textContent = '0';
    }
}

async function loadMilestoneCounts() {
    try {
        const response = await fetch('/api/milestones/count');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('totalMilestones').textContent = data.total || 0;
        }
    } catch (error) {
        console.error('Error loading milestone counts:', error);
        document.getElementById('totalMilestones').textContent = '0';
    }
}

function calculateCompletionRate() {
    const goalCards = document.querySelectorAll('.goal-card');
    const completedGoals = document.querySelectorAll('.goal-card[data-status="completed"]');
    
    if (goalCards.length === 0) {
        document.getElementById('completionRate').textContent = '0%';
        return;
    }
    
    const rate = Math.round((completedGoals.length / goalCards.length) * 100);
    document.getElementById('completionRate').textContent = `${rate}%`;
}

// ======================== GOAL FILTERING ========================

function setupGoalFiltering() {
    const filterButtons = document.querySelectorAll('input[name="goalFilter"]');
    
    filterButtons.forEach(button => {
        button.addEventListener('change', function() {
            const filter = this.id.replace('filter', '').toLowerCase();
            filterGoals(filter);
        });
    });
}

function filterGoals(filter) {
    const goalCards = document.querySelectorAll('.goal-card');
    
    goalCards.forEach(card => {
        const status = card.getAttribute('data-status');
        let shouldShow = false;
        
        switch (filter) {
            case 'all':
                shouldShow = true;
                break;
            case 'active':
                shouldShow = status === 'active';
                break;
            case 'completed':
                shouldShow = status === 'completed';
                break;
        }
        
        if (shouldShow) {
            card.classList.remove('filtered-out');
            card.classList.add('filtered-in');
            card.style.display = 'block';
        } else {
            card.classList.remove('filtered-in');
            card.classList.add('filtered-out');
            setTimeout(() => {
                if (card.classList.contains('filtered-out')) {
                    card.style.display = 'none';
                }
            }, 300);
        }
    });
}

// ======================== AI ASSISTANT ========================

function initializeAIAssistant() {
    // Add welcome message if conversation is empty
    const conversation = document.getElementById('aiConversation');
    if (conversation.children.length === 1) {
        // Only has the initial message
        aiConversationHistory = [{
            role: 'assistant',
            content: `Hello! I'm your AI Goal Coach. I can help you create SMART goals, break them down into milestones, and provide motivation. What would you like to achieve?`
        }];
    }
}

async function sendAIMessage() {
    const input = document.getElementById('aiInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Check if user has premium for unlimited conversations
    if (!isPremiumUser() && aiConversationHistory.length > 10) {
        showPremiumModal('Unlimited AI conversations are a premium feature. Upgrade to continue chatting with your AI coach!');
        return;
    }
    
    // Add user message to conversation
    addMessageToConversation('user', message);
    input.value = '';
    
    // Show typing indicator
    showAITyping();
    
    try {
        // Send to AI endpoint
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                context: 'goal_coaching',
                history: aiConversationHistory.slice(-10) // Last 10 messages for context
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            hideAITyping();
            addMessageToConversation('assistant', data.response);
            
            // Update conversation history
            aiConversationHistory.push(
                { role: 'user', content: message },
                { role: 'assistant', content: data.response }
            );
        } else {
            hideAITyping();
            addMessageToConversation('assistant', 'Sorry, I encountered an error. Please try again.');
        }
        
    } catch (error) {
        console.error('Error sending AI message:', error);
        hideAITyping();
        addMessageToConversation('assistant', 'Sorry, I\'m having trouble connecting. Please try again.');
    }
}

function addMessageToConversation(role, content) {
    const conversation = document.getElementById('aiConversation');
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${role === 'user' ? 'user-message' : ''}`;
    
    messageDiv.innerHTML = `
        <div class="message-content ${role === 'user' ? 'user-content' : ''}">
            ${content}
        </div>
    `;
    
    conversation.appendChild(messageDiv);
    conversation.scrollTop = conversation.scrollHeight;
}

function showAITyping() {
    const conversation = document.getElementById('aiConversation');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'ai-message typing-indicator';
    typingDiv.id = 'typingIndicator';
    
    typingDiv.innerHTML = `
        <div class="message-content">
            <div class="thinking-animation">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        </div>
    `;
    
    conversation.appendChild(typingDiv);
    conversation.scrollTop = conversation.scrollHeight;
}

function hideAITyping() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

// ======================== GOAL CREATION WIZARD ========================

function nextWizardStep() {
    if (currentStep === 1) {
        // Validate step 1
        const title = document.getElementById('goalTitle').value.trim();
        const category = document.getElementById('goalCategory').value;
        const deadline = document.getElementById('goalDeadline').value;
        
        if (!title || !category || !deadline) {
            showToast('Please fill in all required fields', 'error');
            return;
        }
        
        // Move to step 2 and generate milestones
        currentStep = 2;
        updateWizardStep();
        generateMilestones();
        
    } else if (currentStep === 2) {
        // Finish wizard
        document.getElementById('nextStep').style.display = 'none';
        document.getElementById('createGoal').style.display = 'inline-block';
    }
}

function prevWizardStep() {
    if (currentStep > 1) {
        currentStep--;
        updateWizardStep();
    }
}

function updateWizardStep() {
    // Hide all steps
    document.querySelectorAll('.wizard-step').forEach(step => {
        step.classList.remove('active');
    });
    
    // Show current step
    document.getElementById(`step${currentStep}`).classList.add('active');
    
    // Update buttons
    const prevBtn = document.getElementById('prevStep');
    const nextBtn = document.getElementById('nextStep');
    
    if (currentStep === 1) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'inline-block';
        nextBtn.textContent = 'Next';
    } else {
        prevBtn.style.display = 'inline-block';
        nextBtn.style.display = 'inline-block';
        nextBtn.textContent = 'Review & Create';
    }
}

async function generateMilestones() {
    const title = document.getElementById('goalTitle').value;
    const description = document.getElementById('goalDescription').value;
    const category = document.getElementById('goalCategory').value;
    const deadline = document.getElementById('goalDeadline').value;
    
    try {
        const response = await fetch('/api/ai/generate-milestones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                description,
                category,
                deadline
            })
        });
        
        const data = await response.json();
        
        if (data.success && data.milestones) {
            generatedMilestones = data.milestones;
            displayGeneratedMilestones(data.milestones);
        } else {
            showMilestoneError();
        }
        
    } catch (error) {
        console.error('Error generating milestones:', error);
        showMilestoneError();
    }
}

function displayGeneratedMilestones(milestones) {
    document.getElementById('aiStatus').style.display = 'none';
    document.getElementById('generatedMilestones').style.display = 'block';
    
    const milestonesList = document.getElementById('milestonesList');
    milestonesList.innerHTML = '';
    
    milestones.forEach((milestone, index) => {
        const milestoneDiv = document.createElement('div');
        milestoneDiv.className = 'milestone-item';
        milestoneDiv.innerHTML = `
            <div class="milestone-number">${index + 1}</div>
            <div class="milestone-content">
                <div class="milestone-title">${milestone.title}</div>
                <div class="milestone-description">${milestone.description}</div>
            </div>
        `;
        milestonesList.appendChild(milestoneDiv);
    });
}

function showMilestoneError() {
    document.getElementById('aiStatus').innerHTML = `
        <div class="alert alert-warning">
            <i class="fas fa-exclamation-triangle me-2"></i>
            Unable to generate milestones automatically. You can add them manually after creating the goal.
        </div>
    `;
}

async function regenerateMilestones() {
    document.getElementById('generatedMilestones').style.display = 'none';
    document.getElementById('aiStatus').style.display = 'block';
    document.getElementById('aiStatus').innerHTML = `
        <div class="ai-thinking">
            <div class="thinking-animation">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
            <p>Regenerating milestones with a fresh perspective...</p>
        </div>
    `;
    
    await generateMilestones();
}

function addCustomMilestone() {
    const title = prompt('Enter milestone title:');
    if (title) {
        const description = prompt('Enter milestone description (optional):') || '';
        
        generatedMilestones.push({
            title: title,
            description: description,
            target_date: document.getElementById('goalDeadline').value
        });
        
        displayGeneratedMilestones(generatedMilestones);
    }
}

async function createGoalWithMilestones() {
    const goalData = {
        title: document.getElementById('goalTitle').value,
        description: document.getElementById('goalDescription').value,
        category: document.getElementById('goalCategory').value,
        targetDate: document.getElementById('goalDeadline').value,
        milestones: generatedMilestones
    };
    
    try {
        const response = await fetch('/api/goals/create-with-milestones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(goalData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Close modal and refresh page
            const modal = bootstrap.Modal.getInstance(document.getElementById('newGoalModal'));
            modal.hide();
            
            showToast('Goal created successfully with AI-generated milestones!', 'success');
            
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            showToast(data.error || 'Failed to create goal', 'error');
        }
        
    } catch (error) {
        console.error('Error creating goal:', error);
        showToast('Failed to create goal. Please try again.', 'error');
    }
}

// ======================== GOAL ACTIONS ========================

async function viewGoalDetails(goalId) {
    try {
        const response = await fetch(`/api/goals/${goalId}/details`);
        const data = await response.json();
        
        if (data.success) {
            displayGoalDetailsModal(data.goal);
        } else {
            showToast('Failed to load goal details', 'error');
        }
        
    } catch (error) {
        console.error('Error loading goal details:', error);
        showToast('Failed to load goal details', 'error');
    }
}

function displayGoalDetailsModal(goal) {
    const content = document.getElementById('goalDetailsContent');
    
    content.innerHTML = `
        <div class="goal-details-header">
            <h3>${goal.title}</h3>
            <div class="goal-meta-info">
                <span class="badge bg-${goal.status === 'completed' ? 'success' : 'primary'}">${goal.status}</span>
                <span class="badge bg-secondary">${goal.category}</span>
            </div>
        </div>
        
        <div class="goal-description">
            <p>${goal.description || 'No description provided'}</p>
        </div>
        
        <div class="goal-progress-section">
            <h5>Progress Overview</h5>
            <div class="progress mb-3">
                <div class="progress-bar" style="width: ${goal.progress || 0}%"></div>
            </div>
            <p>Overall Progress: ${goal.progress || 0}%</p>
        </div>
        
        <div class="milestones-section">
            <h5>Milestones</h5>
            ${goal.milestones && goal.milestones.length > 0 ? 
                goal.milestones.map((milestone, index) => `
                    <div class="milestone-card">
                        <div class="milestone-header">
                            <span class="milestone-number">${index + 1}</span>
                            <h6>${milestone.title}</h6>
                            <span class="badge bg-${milestone.status === 'completed' ? 'success' : 'primary'}">${milestone.status}</span>
                        </div>
                        <p>${milestone.description}</p>
                        <div class="milestone-progress">
                            <div class="progress">
                                <div class="progress-bar" style="width: ${milestone.progress_percentage || 0}%"></div>
                            </div>
                            <small>${milestone.progress_percentage || 0}% complete</small>
                        </div>
                    </div>
                `).join('') :
                '<p class="text-muted">No milestones available for this goal.</p>'
            }
        </div>
    `;
    
    const modal = new bootstrap.Modal(document.getElementById('goalDetailsModal'));
    modal.show();
}

async function editGoal(goalId) {
    // Redirect to goal detail page for editing
    window.location.href = `/goals/detail/${goalId}`;
}

async function deleteGoal(goalId) {
    if (!confirm('Are you sure you want to delete this goal? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/goals/${goalId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Goal deleted successfully', 'success');
            
            // Remove goal card from DOM
            const goalCard = document.querySelector(`[data-goal-id="${goalId}"]`);
            if (goalCard) {
                goalCard.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => {
                    goalCard.remove();
                    calculateCompletionRate();
                }, 300);
            }
        } else {
            showToast(data.error || 'Failed to delete goal', 'error');
        }
        
    } catch (error) {
        console.error('Error deleting goal:', error);
        showToast('Failed to delete goal', 'error');
    }
}

// ======================== PREMIUM FEATURES ========================

function isPremiumUser() {
    // Check if user has premium subscription
    const userPlan = document.body.getAttribute('data-user-plan');
    return userPlan === 'premium';
}

async function loadPremiumAnalytics() {
    try {
        const response = await fetch('/api/analytics/dashboard');
        const data = await response.json();
        
        if (data.success) {
            renderProgressChart(data.chartData);
            updateAnalyticsInsights(data.insights);
        }
        
    } catch (error) {
        console.error('Error loading premium analytics:', error);
    }
}

function renderProgressChart(chartData) {
    const ctx = document.getElementById('progressChart');
    if (!ctx) return;
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Goal Progress',
                data: chartData.progress,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });
}

function updateAnalyticsInsights(insights) {
    const insightsContainer = document.querySelector('.analytics-insights');
    if (insightsContainer && insights) {
        // Update insights dynamically based on user data
        // This would be populated with real AI-generated insights
    }
}

function showPremiumModal(message) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">
                        <i class="fas fa-crown text-warning me-2"></i>Premium Feature
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body text-center">
                    <i class="fas fa-crown fa-3x text-warning mb-3"></i>
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Maybe Later</button>
                    <a href="/subscription" class="btn btn-gradient">
                        <i class="fas fa-crown me-2"></i>Upgrade Now
                    </a>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    
    modal.addEventListener('hidden.bs.modal', () => {
        modal.remove();
    });
}

// ======================== UTILITY FUNCTIONS ========================

function updateQuickStats() {
    // Update average duration
    const goalCards = document.querySelectorAll('.goal-card');
    if (goalCards.length > 0) {
        // Calculate average duration (simplified)
        document.getElementById('avgDuration').textContent = '2.3 months';
    }
}

// Add user plan to body for premium checks
function isPremiumUser() {
    // Check if user has premium subscription from the EJS template
    return document.body.getAttribute('data-user-plan') === 'premium';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary'} border-0`;
    toast.setAttribute('role', 'alert');
    
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        document.body.appendChild(toastContainer);
    }
    
    toastContainer.appendChild(toast);
    
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
    
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

// Reset wizard when modal is closed
document.getElementById('newGoalModal')?.addEventListener('hidden.bs.modal', function() {
    currentStep = 1;
    generatedMilestones = [];
    updateWizardStep();
    
    // Reset form
    document.getElementById('goalForm').reset();
    document.getElementById('aiStatus').style.display = 'block';
    document.getElementById('generatedMilestones').style.display = 'none';
    
    // Reset AI status
    document.getElementById('aiStatus').innerHTML = `
        <div class="ai-thinking">
            <div class="thinking-animation">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
            <p>AI is analyzing your goal and creating personalized milestones...</p>
        </div>
    `;
});

// ======================== GREETING & MOTIVATIONAL QUOTE ========================

function updateGreeting() {
    const greetingEl = document.getElementById('greeting-text');
    if (!greetingEl) return;
    
    const hours = new Date().getHours();
    let greeting = 'Hello';
    if (hours >= 5 && hours < 12) {
        greeting = 'Good morning';
    } else if (hours >= 12 && hours < 17) {
        greeting = 'Good afternoon';
    } else if (hours >= 17 && hours < 22) {
        greeting = 'Good evening';
    } else {
        greeting = 'Working late';
    }
    greetingEl.textContent = greeting;
}

async function loadMotivationalQuote() {
    const messageEl = document.getElementById('motivational-message');
    if (!messageEl) return;
    
    try {
        const response = await fetch('/api/motivation/quote');
        const data = await response.json();
        if (data.success) {
            messageEl.textContent = `"${data.quote}" — ${data.author}`;
            return;
        }
    } catch (error) {
        console.warn('Failed to fetch quote, using fallback', error);
    }
    
    // Fallback quotes
    const fallback = [
        { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
        { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
        { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
        { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
        { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" }
    ];
    const random = fallback[Math.floor(Math.random() * fallback.length)];
    messageEl.textContent = `"${random.text}" — ${random.author}`;
} 