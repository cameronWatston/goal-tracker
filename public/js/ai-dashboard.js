document.addEventListener('DOMContentLoaded', function() {
  // Global variables
  let currentGoalId = null;
  let goalData = {};
  let chatHistory = [];

  // Initialize UI
  setupEventListeners();
  loadGoalsList();
  initTooltips();
  addEmptyStates();

  // Setup event listeners
  function setupEventListeners() {
    // Goal selection in sidebar
    document.querySelectorAll('.goal-list-item').forEach(item => {
      item.addEventListener('click', function() {
        const goalId = this.getAttribute('data-goal-id');
        selectGoal(goalId);
      });
    });

    // Filter goals by status
    document.querySelectorAll('.goals-filter').forEach(filter => {
      filter.addEventListener('click', function(e) {
        e.preventDefault();
        const filterType = this.getAttribute('data-filter');
        filterGoals(filterType);
        
        // Update active state
        document.querySelectorAll('.goals-filter').forEach(f => f.classList.remove('active'));
        this.classList.add('active');
      });
    });

    // Progress logging form
    document.getElementById('progress-log-form')?.addEventListener('submit', function(e) {
      e.preventDefault();
      const input = document.getElementById('natural-language-input').value;
      if (input.trim()) {
        processNaturalLanguageUpdate(currentGoalId, input);
      }
    });

    // AI Chat form
    document.getElementById('ai-chat-form')?.addEventListener('submit', function(e) {
      e.preventDefault();
      const input = document.getElementById('ai-message-input').value;
      if (input.trim()) {
        sendChatMessage(input);
      }
    });

    // Progress modal handlers
    document.getElementById('log-progress-btn')?.addEventListener('click', function() {
      if (currentGoalId) {
        document.getElementById('progress-goal-id').value = currentGoalId;
        const modal = new bootstrap.Modal(document.getElementById('logProgressModal'));
        modal.show();
      }
    });

    document.getElementById('save-progress-btn')?.addEventListener('click', function() {
      const description = document.getElementById('progress-description').value;
      if (description.trim()) {
        const goalId = document.getElementById('progress-goal-id').value;
        saveProgress(goalId, description);
      }
    });

    // Analytics refresh button
    document.getElementById('refresh-analytics-btn')?.addEventListener('click', function() {
      if (currentGoalId) {
        const btn = this;
        btn.innerHTML = '<i class="fas fa-sync-alt fa-spin me-1"></i> Refreshing...';
        btn.disabled = true;

        setTimeout(() => {
          loadAnalytics(currentGoalId);
          btn.innerHTML = '<i class="fas fa-sync-alt me-1"></i> Refresh';
          btn.disabled = false;
        }, 1000);
      }
    });

    // Enter key in chat input
    document.getElementById('ai-message-input')?.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('ai-chat-form').dispatchEvent(new Event('submit'));
      }
    });
  }

  // Initialize tooltips
  function initTooltips() {
    // Add tooltip attributes to elements
    const tooltips = [
      { id: 'ai-adjusted', text: 'Targets adjusted by AI based on your progress patterns' },
      { id: 'refresh-analytics-btn', text: 'Refresh analytics data' },
      { id: 'milestone-count', text: 'Total number of milestones for this goal' },
      { id: 'progress-percentage', text: 'Overall completion percentage' }
    ];
    
    tooltips.forEach(tooltip => {
      const el = document.getElementById(tooltip.id);
      if (el) {
        el.setAttribute('data-tooltip', tooltip.text);
      }
    });
  }

  // Add empty states for sections when no goal is selected
  function addEmptyStates() {
    // Add empty state to analytics sections
    document.getElementById('streak-heatmap').innerHTML = getEmptyState('fa-calendar-day', 'Select a goal to view your activity streak');
    document.getElementById('progress-trend').innerHTML = getEmptyState('fa-chart-line', 'Your progress trend will appear here');
    
    function getEmptyState(icon, message) {
      return `
        <div class="empty-state">
          <i class="fas ${icon}"></i>
          <p>${message}</p>
        </div>
      `;
    }
  }

  // Load the list of goals
  function loadGoalsList() {
    // Since we already have goals rendered server-side, we just need to initialize progress bars
    document.querySelectorAll('.goal-list-item').forEach(item => {
      const goalId = item.getAttribute('data-goal-id');
      fetchGoalProgress(goalId);
    });

    // If no goals are available, show a message
    const goalsContainer = document.getElementById('goals-list-container');
    if (goalsContainer && goalsContainer.children.length === 0) {
      goalsContainer.innerHTML = `
        <div class="empty-state p-4">
          <i class="fas fa-tasks"></i>
          <p>No goals available</p>
          <button class="btn btn-sm btn-primary mt-2" data-bs-toggle="modal" data-bs-target="#newGoalModal">
            <i class="fas fa-plus-circle me-1"></i> Create Goal
          </button>
        </div>
      `;
    }
  }

  // Fetch goal progress for progress bars
  function fetchGoalProgress(goalId) {
    fetch(`/api/goals/${goalId}`)
      .then(response => response.json())
      .then(data => {
        if (data && data.milestones) {
          const totalMilestones = data.milestones.length;
          const completedMilestones = data.milestones.filter(m => m.status === 'completed').length;
          const progressPercent = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
          
          // Update progress bar with animation
          const progressBar = document.getElementById(`progress-bar-${goalId}`);
          if (progressBar) {
            setTimeout(() => {
              progressBar.style.width = `${progressPercent}%`;
              progressBar.setAttribute('aria-valuenow', progressPercent);
            }, 300); // Delay for animation effect
          }
          
          // Store goal data for later use
          goalData[goalId] = data;
        }
      })
      .catch(error => console.error('Error fetching goal progress:', error));
  }

  // Select a goal to display in the main panel
  function selectGoal(goalId) {
    // Set current goal ID
    currentGoalId = goalId;
    
    // Update UI to show the selected goal is active
    document.querySelectorAll('.goal-list-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-goal-id') === goalId) {
        item.classList.add('active');
        // Scroll into view if needed
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    
    // Enable buttons that require a selected goal
    document.getElementById('log-progress-btn').removeAttribute('disabled');
    document.getElementById('edit-goal-btn').removeAttribute('disabled');
    document.getElementById('share-goal-btn').removeAttribute('disabled');
    document.getElementById('delete-goal-btn').removeAttribute('disabled');
    
    // Show goal details and hide placeholder with animation
    const placeholder = document.getElementById('goal-placeholder');
    const details = document.getElementById('goal-details');
    
    if (placeholder.classList.contains('d-none')) {
      // Already showing details, just update them
      if (goalData[goalId]) {
        displayGoalDetails(goalData[goalId]);
      } else {
        loadGoalDetails(goalId);
      }
    } else {
      // Animate transition
      placeholder.style.opacity = '1';
      details.classList.remove('d-none');
      details.style.opacity = '0';
      
      // Fade out placeholder
      placeholder.style.transition = 'opacity 0.3s ease';
      placeholder.style.opacity = '0';
      
      setTimeout(() => {
        placeholder.classList.add('d-none');
        
        // Load and display goal data
        if (goalData[goalId]) {
          displayGoalDetails(goalData[goalId]);
        } else {
          loadGoalDetails(goalId);
        }
        
        // Fade in details
        details.style.transition = 'opacity 0.3s ease';
        details.style.opacity = '1';
      }, 300);
    }
    
    // Load AI insights for this goal
    loadAIInsights(goalId);
    
    // Load weekly targets
    loadWeeklyTargets(goalId);
     
    // Load analytics
    loadAnalytics(goalId);
  }

  // Load goal details from the API
  function loadGoalDetails(goalId) {
    fetch(`/api/goals/${goalId}`)
      .then(response => response.json())
      .then(data => {
        goalData[goalId] = data;
        displayGoalDetails(data);
      })
      .catch(error => console.error('Error loading goal details:', error));
  }

  // Display goal details in the UI
  function displayGoalDetails(goal) {
    // Set goal title
    document.getElementById('current-goal-title').textContent = goal.title;
    
    // Update progress bar
    const totalMilestones = goal.milestones ? goal.milestones.length : 0;
    const completedMilestones = goal.milestones ? goal.milestones.filter(m => m.status === 'completed').length : 0;
    const progressPercent = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
    
    document.getElementById('progress-percentage').textContent = `${progressPercent}%`;
    document.getElementById('main-progress-bar').style.width = `${progressPercent}%`;
    document.getElementById('main-progress-bar').setAttribute('aria-valuenow', progressPercent);
    
    // Update milestone count
    document.getElementById('milestone-count').textContent = `${totalMilestones} Milestones`;
    
    // Display milestones timeline
    displayMilestones(goal.milestones || []);
  }

  // Display milestones in a timeline
  function displayMilestones(milestones) {
    const container = document.getElementById('milestone-timeline-container');
    
    if (milestones.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-flag"></i>
          <p>No milestones available for this goal.</p>
          <button class="btn btn-sm btn-outline-primary mt-2">
            <i class="fas fa-plus me-1"></i> Add Milestone
          </button>
        </div>
      `;
      return;
    }
    
    // Sort milestones by target date
    milestones.sort((a, b) => new Date(a.target_date) - new Date(b.target_date));
    
    let html = '';
    milestones.forEach((milestone, index) => {
      const isCompleted = milestone.status === 'completed';
      const isCurrent = !isCompleted && index === milestones.filter(m => m.status !== 'completed').length - 1;
      
      const targetDate = new Date(milestone.target_date);
      const formattedDate = targetDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      
      // Calculate time estimate if available
      const timeEstimate = milestone.time_estimate || '';
      
      html += `
        <div class="milestone-item ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}" 
             data-milestone-id="${milestone.id}" data-completed="${isCompleted}">
          <div class="mb-2">
            <div class="d-flex justify-content-between align-items-center">
              <h6 class="mb-0">${milestone.title}</h6>
              <span class="badge ${isCompleted ? 'bg-success' : 'bg-primary'}">${isCompleted ? 'Completed' : formattedDate}</span>
            </div>
            <p class="text-muted small mb-0">${milestone.description}</p>
            ${timeEstimate ? `<small class="text-muted"><i class="fas fa-clock me-1"></i> ${timeEstimate}</small>` : ''}
          </div>
          ${!isCompleted ? `
            <div class="mt-2">
              <button class="btn btn-sm btn-outline-success complete-milestone-btn" data-milestone-id="${milestone.id}">
                <i class="fas fa-check me-1"></i> Mark Complete
              </button>
            </div>
          ` : ''}
        </div>
      `;
    });
    
    container.innerHTML = html;
    
    // Add event listeners to milestone completion buttons
    document.querySelectorAll('.complete-milestone-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const milestoneId = this.getAttribute('data-milestone-id');
        completeMilestone(milestoneId);
      });
    });
  }

  // Complete a milestone
  function completeMilestone(milestoneId) {
    // Here you would typically make an API call to update the milestone status
    // For demo purposes, we'll just update the UI
    
    const milestoneItem = document.querySelector(`.milestone-item[data-milestone-id="${milestoneId}"]`);
    
    if (milestoneItem) {
      // Add a loading state
      milestoneItem.innerHTML += `
        <div class="position-absolute top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center bg-white bg-opacity-75">
          <div class="spinner-border text-success" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>
      `;
      
      // Simulate API call
      setTimeout(() => {
        // Update UI
        milestoneItem.classList.add('completed');
        milestoneItem.setAttribute('data-completed', 'true');
        
        // Re-render milestones
        const goal = goalData[currentGoalId];
        if (goal && goal.milestones) {
          // Find and update the milestone
          const milestone = goal.milestones.find(m => m.id.toString() === milestoneId.toString());
          if (milestone) {
            milestone.status = 'completed';
            
            // Update progress
            const totalMilestones = goal.milestones.length;
            const completedMilestones = goal.milestones.filter(m => m.status === 'completed').length;
            const progressPercent = Math.round((completedMilestones / totalMilestones) * 100);
            
            // Update progress bar and display with animation
            document.getElementById('progress-percentage').textContent = `${progressPercent}%`;
            document.getElementById('main-progress-bar').style.width = `${progressPercent}%`;
            
            // Show celebration effect
            showCelebration();
            
            // Re-render milestones
            displayMilestones(goal.milestones);
          }
        }
      }, 1000);
    }
  }

  // Show celebration effect for milestone completion
  function showCelebration() {
    // Create confetti container if it doesn't exist
    let confettiContainer = document.getElementById('confetti-container');
    
    if (!confettiContainer) {
      confettiContainer = document.createElement('div');
      confettiContainer.id = 'confetti-container';
      confettiContainer.style.position = 'fixed';
      confettiContainer.style.top = '0';
      confettiContainer.style.left = '0';
      confettiContainer.style.width = '100%';
      confettiContainer.style.height = '100%';
      confettiContainer.style.pointerEvents = 'none';
      confettiContainer.style.zIndex = '9999';
      document.body.appendChild(confettiContainer);
    }
    
    // Create and animate confetti pieces
    const colors = ['#1e40af', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'];
    const confettiCount = 100;
    
    for (let i = 0; i < confettiCount; i++) {
      const confetti = document.createElement('div');
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      confetti.style.position = 'absolute';
      confetti.style.width = `${Math.random() * 10 + 5}px`;
      confetti.style.height = `${Math.random() * 5 + 2}px`;
      confetti.style.backgroundColor = color;
      confetti.style.borderRadius = '2px';
      confetti.style.opacity = '0.8';
      confetti.style.top = '0';
      confetti.style.left = `${Math.random() * 100}%`;
      
      confettiContainer.appendChild(confetti);
      
      // Animate falling confetti
      const duration = Math.random() * 3 + 2;
      const rotation = Math.random() * 360;
      const scale = Math.random() * 0.5 + 0.5;
      
      confetti.animate([
        { transform: `translateY(0) rotate(0deg) scale(${scale})`, opacity: 0.8 },
        { transform: `translateY(${window.innerHeight}px) rotate(${rotation}deg) scale(${scale})`, opacity: 0 }
      ], {
        duration: duration * 1000,
        easing: 'cubic-bezier(0.1, 0.8, 0.9, 1)'
      }).onfinish = () => {
        confetti.remove();
      };
    }
    
    // Show success toast
    showToast('Milestone Completed!', 'Great job! Keep up the momentum.', 'success');
    
    // Remove confetti container after animation completes
    setTimeout(() => {
      if (confettiContainer && confettiContainer.childElementCount === 0) {
        confettiContainer.remove();
      }
    }, 5000);
  }

  // Filter goals by status
  function filterGoals(status) {
    document.querySelectorAll('.goal-list-item').forEach(item => {
      const goalStatus = item.getAttribute('data-status');
      if (status === 'all' || goalStatus === status) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
  }

  // Load AI-generated weekly targets
  function loadWeeklyTargets(goalId) {
    const container = document.getElementById('weekly-targets-container');
    
    // Show loading state
    container.innerHTML = `
      <div class="card-body p-3">
        <div class="spinner-border spinner-border-sm text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <span class="ms-2">Loading weekly targets...</span>
      </div>
    `;
    
    // Fetch weekly targets from the API
    fetch(`/ai/weekly-targets?goalId=${goalId}`)
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          displayWeeklyTargets(data.data);
        } else {
          // Show error message
          container.innerHTML = `
            <div class="card-body p-3">
              <div class="alert alert-warning mb-0">
                <i class="fas fa-exclamation-triangle me-2"></i> ${data.error || 'Failed to load weekly targets.'}
              </div>
            </div>
          `;
        }
      })
      .catch(error => {
        console.error('Error loading weekly targets:', error);
        // For demo purposes, display mock weekly targets when API call fails
        displayWeeklyTargets(generateMockWeeklyTargets());
      });
  }

  // Display weekly targets in the UI
  function displayWeeklyTargets(targets) {
    const container = document.getElementById('weekly-targets-container');
    
    if (!targets || targets.length === 0) {
      container.innerHTML = `
        <div class="card-body p-3">
          <p class="text-muted mb-0">No weekly targets available.</p>
        </div>
      `;
      return;
    }
    
    let html = '<div class="list-group list-group-flush">';
    targets.forEach(target => {
      html += `
        <div class="list-group-item px-3 py-2 d-flex align-items-center weekly-target-item">
          <div class="weekly-target-check ${target.completed ? 'completed' : ''}" data-target-id="${target.id}">
            ${target.completed ? '<i class="fas fa-check"></i>' : ''}
          </div>
          <div class="ms-3 flex-grow-1">
            <p class="mb-0">${target.title}</p>
            <small class="text-muted">${target.due}</small>
          </div>
        </div>
      `;
    });
    html += '</div>';
    
    container.innerHTML = html;
    
    // Add event listeners to target checkboxes
    document.querySelectorAll('.weekly-target-check').forEach(check => {
      check.addEventListener('click', function() {
        const targetId = this.getAttribute('data-target-id');
        toggleTargetCompletion(targetId, !this.classList.contains('completed'));
      });
    });
  }

  // Toggle completion status for a weekly target
  function toggleTargetCompletion(targetId, completed) {
    fetch(`/api/targets/${targetId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ completed })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Update UI
        const checkbox = document.querySelector(`.weekly-target-check[data-target-id="${targetId}"]`);
        if (checkbox) {
          if (completed) {
            checkbox.classList.add('completed');
            checkbox.innerHTML = '<i class="fas fa-check"></i>';
          } else {
            checkbox.classList.remove('completed');
            checkbox.innerHTML = '';
          }
        }
      }
    })
    .catch(error => {
      console.error('Error toggling target completion:', error);
      // For demo purposes, still update the UI
      const checkbox = document.querySelector(`.weekly-target-check[data-target-id="${targetId}"]`);
      if (checkbox) {
        if (completed) {
          checkbox.classList.add('completed');
          checkbox.innerHTML = '<i class="fas fa-check"></i>';
        } else {
          checkbox.classList.remove('completed');
          checkbox.innerHTML = '';
        }
      }
    });
  }

  // Load AI insights for the current goal
  function loadAIInsights(goalId) {
    fetch(`/ai/insights?goalId=${goalId}`)
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          document.getElementById('ai-insight-text').textContent = data.data;
        }
      })
      .catch(error => {
        console.error('Error loading AI insights:', error);
        // For demo purposes, display a mock insight
        document.getElementById('ai-insight-text').textContent = 
          "Your most consistent days are Tuesday and Thursday. I notice your productivity dropped last Thursday—want to adjust your plan to include more flexibility on Thursdays?";
      });
  }

  // Load analytics for the current goal
  function loadAnalytics(goalId) {
    // In a real implementation, this would fetch data from the API and render charts
    // For this demo, we'll simulate loading and then show mock charts
    
    document.getElementById('streak-heatmap').innerHTML = 
      '<div class="d-flex justify-content-center align-items-center h-100"><div class="spinner-border text-primary" role="status"></div></div>';
    document.getElementById('progress-trend').innerHTML = 
      '<div class="d-flex justify-content-center align-items-center h-100"><div class="spinner-border text-primary" role="status"></div></div>';
    
    // Simulate API delay
    setTimeout(() => {
      renderMockHeatmap();
      renderMockTrendChart();
    }, 1000);
  }

  // Process natural language update
  function processNaturalLanguageUpdate(goalId, userInput) {
    const input = document.getElementById('natural-language-input');
    const originalText = input.value;
    
    // Show loading state
    input.value = 'Processing...';
    input.disabled = true;
    
    fetch('/ai/process-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        goalId,
        userInput
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Clear input and re-enable
        input.value = '';
        input.disabled = false;
        
        // Show success message with a more appealing design
        const successAlert = document.createElement('div');
        successAlert.className = 'alert alert-success mt-3 d-flex align-items-center';
        successAlert.innerHTML = `
          <div class="flex-shrink-0">
            <i class="fas fa-check-circle fa-2x me-3"></i>
          </div>
          <div class="flex-grow-1">
            <h6 class="alert-heading mb-1">Progress Logged!</h6>
            <p class="mb-0">${data.data.progressMade || 'Progress update'}</p>
          </div>
        `;
        
        const form = document.getElementById('progress-log-form');
        form.appendChild(successAlert);
        
        // Remove alert after 3 seconds with fade-out animation
        setTimeout(() => {
          successAlert.style.transition = 'opacity 0.5s ease';
          successAlert.style.opacity = '0';
          setTimeout(() => successAlert.remove(), 500);
        }, 3000);
        
        // Refresh goal data
        loadGoalDetails(goalId);
        loadWeeklyTargets(goalId);
        loadAnalytics(goalId);
      } else {
        // Show error
        input.value = originalText;
        input.disabled = false;
        showToast('Error', data.error || 'Unknown error', 'danger');
      }
    })
    .catch(error => {
      console.error('Error processing update:', error);
      
      // For demo purposes, simulate successful update
      input.value = '';
      input.disabled = false;
      
      const successAlert = document.createElement('div');
      successAlert.className = 'alert alert-success mt-3 d-flex align-items-center';
      successAlert.innerHTML = `
        <div class="flex-shrink-0">
          <i class="fas fa-check-circle fa-2x me-3"></i>
        </div>
        <div class="flex-grow-1">
          <h6 class="alert-heading mb-1">Progress Logged!</h6>
          <p class="mb-0">${userInput}</p>
        </div>
      `;
      
      const form = document.getElementById('progress-log-form');
      form.appendChild(successAlert);
      
      setTimeout(() => {
        successAlert.style.transition = 'opacity 0.5s ease';
        successAlert.style.opacity = '0';
        setTimeout(() => successAlert.remove(), 500);
      }, 3000);
    });
  }

  // Send a chat message to the AI assistant
  function sendChatMessage(message) {
    const input = document.getElementById('ai-message-input');
    const messageContainer = document.getElementById('chat-messages');
    
    // Clear input
    input.value = '';
    
    // Add user message to chat
    const userMessageEl = document.createElement('div');
    userMessageEl.className = 'message user-message';
    userMessageEl.innerHTML = `
      <div class="message-content">
        <p>${message}</p>
      </div>
    `;
    messageContainer.appendChild(userMessageEl);
    
    // Scroll to bottom
    messageContainer.scrollTop = messageContainer.scrollHeight;
    
    // Add to chat history
    chatHistory.push({ role: 'user', message });
    
    // Show typing indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'message ai-message';
    typingIndicator.id = 'typing-indicator';
    typingIndicator.innerHTML = `
      <div class="message-content">
        <div class="spinner-grow spinner-grow-sm text-secondary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <div class="spinner-grow spinner-grow-sm text-secondary mx-1" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <div class="spinner-grow spinner-grow-sm text-secondary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>
    `;
    messageContainer.appendChild(typingIndicator);
    messageContainer.scrollTop = messageContainer.scrollHeight;
    
    // Send message to AI
    fetch('/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        context: {
          currentGoalId,
          chatHistory
        }
      })
    })
    .then(response => response.json())
    .then(data => {
      // Remove typing indicator
      document.getElementById('typing-indicator')?.remove();
      
      if (data.success) {
        // Add AI response to chat
        const aiMessageEl = document.createElement('div');
        aiMessageEl.className = 'message ai-message';
        aiMessageEl.innerHTML = `
          <div class="message-content">
            <p>${data.response}</p>
          </div>
        `;
        messageContainer.appendChild(aiMessageEl);
        
        // Add to chat history
        chatHistory.push({ role: 'ai', message: data.response });
        
        // If there are suggested actions, handle them
        if (data.actions && data.actions.length > 0) {
          handleSuggestedActions(data.actions);
        }
      } else {
        // Show error message
        const errorMessageEl = document.createElement('div');
        errorMessageEl.className = 'message ai-message';
        errorMessageEl.innerHTML = `
          <div class="message-content">
            <p>Sorry, I encountered an error processing your request.</p>
          </div>
        `;
        messageContainer.appendChild(errorMessageEl);
      }
      
      // Scroll to bottom
      messageContainer.scrollTop = messageContainer.scrollHeight;
    })
    .catch(error => {
      console.error('Error sending chat message:', error);
      
      // Remove typing indicator
      document.getElementById('typing-indicator')?.remove();
      
      // For demo purposes, add a mock response
      const aiMessageEl = document.createElement('div');
      aiMessageEl.className = 'message ai-message';
      aiMessageEl.innerHTML = `
        <div class="message-content">
          <p>I'm here to help you achieve your goals! I notice you're making good progress on your current goal. Is there something specific you'd like help with today?</p>
        </div>
      `;
      messageContainer.appendChild(aiMessageEl);
      messageContainer.scrollTop = messageContainer.scrollHeight;
    });
  }

  // Handle suggested actions from AI
  function handleSuggestedActions(actions) {
    actions.forEach(action => {
      if (action.type === 'redirect') {
        // Add a notification about the redirect
        const messageContainer = document.getElementById('chat-messages');
        const actionEl = document.createElement('div');
        actionEl.className = 'message ai-message';
        actionEl.innerHTML = `
          <div class="message-content">
            <p><i class="fas fa-link me-2"></i> <a href="${action.url}">${action.description || 'Click here'}</a></p>
          </div>
        `;
        messageContainer.appendChild(actionEl);
      } else if (action.type === 'createGoal') {
        // Could trigger the new goal modal with pre-filled data
        console.log('Suggested to create goal:', action.title);
      } else if (action.type === 'updateProgress') {
        // Could trigger the progress update modal
        console.log('Suggested to update progress for goal:', action.goalId);
      }
    });
  }

  // Save progress from modal
  function saveProgress(goalId, description) {
    fetch('/api/progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        goalId,
        content: description
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('logProgressModal'));
        modal.hide();
        
        // Clear form
        document.getElementById('progress-description').value = '';
        document.getElementById('ai-processing-result').classList.add('d-none');
        
        // Refresh goal data
        loadGoalDetails(goalId);
        loadWeeklyTargets(goalId);
        loadAnalytics(goalId);
        
        // Show success toast
        showToast('Progress Saved', 'Your progress has been successfully recorded.');
      } else {
        alert('Failed to save progress: ' + (data.error || 'Unknown error'));
      }
    })
    .catch(error => {
      console.error('Error saving progress:', error);
      
      // For demo purposes, simulate successful update
      const modal = bootstrap.Modal.getInstance(document.getElementById('logProgressModal'));
      modal.hide();
      document.getElementById('progress-description').value = '';
      document.getElementById('ai-processing-result').classList.add('d-none');
      
      showToast('Progress Saved', 'Your progress has been successfully recorded.');
    });
  }

  // Show toast notification with improved design
  function showToast(title, message, type = 'primary') {
    const toastContainer = document.createElement('div');
    toastContainer.className = 'position-fixed bottom-0 end-0 p-3';
    toastContainer.style.zIndex = '1080';
    
    toastContainer.innerHTML = `
      <div class="toast show" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="toast-header text-white bg-${type}">
          <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'danger' ? 'fa-exclamation-circle' : 'fa-info-circle'} me-2"></i>
          <strong class="me-auto">${title}</strong>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
        <div class="toast-body">
          ${message}
        </div>
      </div>
    `;
    
    document.body.appendChild(toastContainer);
    
    // Add animation
    const toast = toastContainer.querySelector('.toast');
    toast.style.transform = 'translateY(100%)';
    toast.style.opacity = '0';
    toast.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    
    setTimeout(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    }, 50);
    
    // Remove after delay
    setTimeout(() => {
      toast.style.transform = 'translateY(100%)';
      toast.style.opacity = '0';
      setTimeout(() => {
        toastContainer.remove();
      }, 300);
    }, 5000);
  }

  // Generate mock weekly targets for demo purposes
  function generateMockWeeklyTargets() {
    const today = new Date();
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    return [
      {
        id: 'wt1',
        title: 'Complete Section 1 of JavaScript course',
        due: 'Today',
        completed: false
      },
      {
        id: 'wt2',
        title: 'Practice arrays and objects (30 minutes)',
        due: `${daysOfWeek[(today.getDay() + 1) % 7]}`,
        completed: false
      },
      {
        id: 'wt3',
        title: 'Build a small calculator project',
        due: `${daysOfWeek[(today.getDay() + 2) % 7]}`,
        completed: false
      },
      {
        id: 'wt4',
        title: 'Review course material and take quiz',
        due: `${daysOfWeek[(today.getDay() + 3) % 7]}`,
        completed: false
      }
    ];
  }

  // Render mock heatmap for demo purposes
  function renderMockHeatmap() {
    const container = document.getElementById('streak-heatmap');
    const weeks = 7; // Number of days to show
    const today = new Date();
    
    let html = '<div class="heatmap-container">';
    html += '<table class="heatmap-table">';
    html += '<tbody>';
    
    // Generate a row of days
    html += '<tr>';
    for (let day = 0; day < weeks; day++) {
      const date = new Date(today);
      date.setDate(today.getDate() - (weeks - day - 1));
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      
      // Generate random intensity for demo
      const random = Math.random();
      let intensity = 0;
      if (random > 0.7) intensity = 3;
      else if (random > 0.4) intensity = 2;
      else if (random > 0.2) intensity = 1;
      
      html += `
        <td>
          <div class="heatmap-day">
            <div class="day-label">${dayName}</div>
            <div class="heat-cell intensity-${intensity}"></div>
          </div>
        </td>
      `;
    }
    html += '</tr>';
    html += '</tbody></table>';
    html += '</div>';
    
    html += `
      <div class="heatmap-legend mt-2">
        <div class="d-flex align-items-center justify-content-between">
          <small class="text-muted">Less</small>
          <div class="d-flex">
            <div class="heat-cell intensity-0 mx-1"></div>
            <div class="heat-cell intensity-1 mx-1"></div>
            <div class="heat-cell intensity-2 mx-1"></div>
            <div class="heat-cell intensity-3 mx-1"></div>
          </div>
          <small class="text-muted">More</small>
        </div>
      </div>
    `;
    
    container.innerHTML = html;
    
    // Add custom CSS for heatmap
    if (!document.getElementById('heatmap-styles')) {
      const styleSheet = document.createElement('style');
      styleSheet.id = 'heatmap-styles';
      styleSheet.textContent = `
        .heatmap-table { width: 100%; }
        .heatmap-day { text-align: center; padding: 2px; }
        .day-label { font-size: 10px; color: #6c757d; margin-bottom: 2px; }
        .heat-cell { width: 100%; height: 20px; border-radius: 2px; }
        .heat-cell.intensity-0 { background-color: #ebedf0; }
        .heat-cell.intensity-1 { background-color: #9be9a8; }
        .heat-cell.intensity-2 { background-color: #40c463; }
        .heat-cell.intensity-3 { background-color: #216e39; }
      `;
      document.head.appendChild(styleSheet);
    }
  }

  // Render mock trend chart for demo purposes
  function renderMockTrendChart() {
    const container = document.getElementById('progress-trend');
    
    const chartHeight = 100;
    const chartWidth = container.offsetWidth - 40;
    const points = 10; // Number of data points
    
    // Generate random data for demo
    const data = [];
    for (let i = 0; i < points; i++) {
      data.push(Math.floor(Math.random() * 100));
    }
    
    // Find min/max values
    const minValue = Math.min(...data);
    const maxValue = Math.max(...data, 100);
    
    // Generate SVG path
    let path = `M 0,${chartHeight - (data[0] / maxValue * chartHeight)}`;
    for (let i = 1; i < data.length; i++) {
      const x = i * (chartWidth / (points - 1));
      const y = chartHeight - (data[i] / maxValue * chartHeight);
      path += ` L ${x},${y}`;
    }
    
    // Generate SVG
    const svg = `
      <svg width="${chartWidth}" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}">
        <!-- Grid lines -->
        <line x1="0" y1="${chartHeight}" x2="${chartWidth}" y2="${chartHeight}" stroke="#e9ecef" stroke-width="1" />
        <line x1="0" y1="${chartHeight/2}" x2="${chartWidth}" y2="${chartHeight/2}" stroke="#e9ecef" stroke-width="1" stroke-dasharray="4" />
        
        <!-- Data line -->
        <path d="${path}" fill="none" stroke="#0d6efd" stroke-width="2" />
        
        <!-- Data points -->
        ${data.map((val, i) => {
          const x = i * (chartWidth / (points - 1));
          const y = chartHeight - (val / maxValue * chartHeight);
          return `<circle cx="${x}" cy="${y}" r="3" fill="#0d6efd" />`;
        }).join('')}
      </svg>
      <div class="d-flex justify-content-between mt-1">
        <small class="text-muted">10 days ago</small>
        <small class="text-muted">Today</small>
      </div>
    `;
    
    container.innerHTML = svg;
  }
});

// Add this outside the main function to ensure it's available
// in case it's needed by other scripts
window.showToast = function(title, message, type = 'primary') {
  const toastContainer = document.createElement('div');
  toastContainer.className = 'position-fixed bottom-0 end-0 p-3';
  toastContainer.style.zIndex = '1080';
  
  toastContainer.innerHTML = `
    <div class="toast show" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-header text-white bg-${type}">
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'danger' ? 'fa-exclamation-circle' : 'fa-info-circle'} me-2"></i>
        <strong class="me-auto">${title}</strong>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">
        ${message}
      </div>
    </div>
  `;
  
  document.body.appendChild(toastContainer);
  
  // Add animation
  const toast = toastContainer.querySelector('.toast');
  toast.style.transform = 'translateY(100%)';
  toast.style.opacity = '0';
  toast.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
  
  setTimeout(() => {
    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';
  }, 50);
  
  // Remove after delay
  setTimeout(() => {
    toast.style.transform = 'translateY(100%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toastContainer.remove();
    }, 300);
  }, 5000);
}; 