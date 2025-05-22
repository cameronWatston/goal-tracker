// AI Chatbot for Premium Users
document.addEventListener('DOMContentLoaded', function() {
  // Check if AI chatbot container exists (only for premium users)
  const chatbotContainer = document.getElementById('ai-chatbot-container');
  if (!chatbotContainer) return;

  // DOM elements
  const chatHistory = document.getElementById('chatbot-history');
  const chatInput = document.getElementById('chatbot-input');
  const sendButton = document.getElementById('chatbot-send');
  const loadingIndicator = document.getElementById('chatbot-loading');
  const minimizeButton = document.getElementById('chatbot-minimize');
  const maximizeButton = document.getElementById('chatbot-maximize');
  const chatbotWindow = document.getElementById('chatbot-window');

  // Initial welcome message
  addBotMessage("Hi there! I'm your AI Goal Assistant. I can help with your goals, provide motivation, or answer questions. What can I help you with today?");

  // Send message on button click
  sendButton.addEventListener('click', sendMessage);

  // Send message on Enter key press
  chatInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });

  // Minimize/maximize chatbot
  if (minimizeButton) {
    minimizeButton.addEventListener('click', function() {
      chatbotWindow.classList.add('minimized');
      maximizeButton.style.display = 'flex';
    });
  }

  if (maximizeButton) {
    maximizeButton.addEventListener('click', function() {
      chatbotWindow.classList.remove('minimized');
      maximizeButton.style.display = 'none';
    });
  }

  // Function to send user message to server
  function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Add user message to chat
    addUserMessage(message);
    chatInput.value = '';
    
    // Show loading indicator
    loadingIndicator.style.display = 'block';
    
    // Call API
    fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        message: message,
        context: getCurrentGoalsContext()
      }),
    })
    .then(response => response.json())
    .then(data => {
      // Hide loading indicator
      loadingIndicator.style.display = 'none';
      
      if (data.success && data.response) {
        // Add bot response to chat
        addBotMessage(data.response);
        
        // Handle any actions returned by the AI
        if (data.actions && data.actions.length > 0) {
          handleAIActions(data.actions);
        }
      } else {
        addBotMessage("I'm sorry, I encountered an error processing your request. Please try again.");
      }
    })
    .catch(error => {
      console.error('Error:', error);
      loadingIndicator.style.display = 'none';
      addBotMessage("I'm sorry, there was an error communicating with the server. Please try again later.");
    });
  }

  // Add user message to chat history
  function addUserMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'chatbot-message user-message';
    messageEl.innerHTML = `
      <div class="message-content">
        <p>${escapeHtml(message)}</p>
        <small class="message-time">${formatTime(new Date())}</small>
      </div>
    `;
    chatHistory.appendChild(messageEl);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  // Add bot message to chat history
  function addBotMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'chatbot-message bot-message';
    messageEl.innerHTML = `
      <div class="message-avatar">
        <i class="fas fa-robot"></i>
      </div>
      <div class="message-content">
        <p>${formatBotMessage(message)}</p>
        <small class="message-time">${formatTime(new Date())}</small>
      </div>
    `;
    chatHistory.appendChild(messageEl);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  // Format bot message (handle markdown, links, etc.)
  function formatBotMessage(message) {
    // Simple markdown-like formatting
    let formatted = escapeHtml(message);
    
    // Bold text
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic text
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Lists
    formatted = formatted.replace(/- (.*?)(?=\n|$)/g, '<li>$1</li>');
    formatted = formatted.replace(/<li>.*?(?=<li>|$)/gs, '<ul>$&</ul>');
    
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
  }

  // Escape HTML to prevent XSS
  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Format time for message timestamp
  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Get current goals as context for the AI
  function getCurrentGoalsContext() {
    // This would ideally fetch from a global state or make an API call
    // For now, we'll return a placeholder
    return {
      activeGoals: window.userGoals || []
    };
  }

  // Handle any actions returned by the AI
  function handleAIActions(actions) {
    actions.forEach(action => {
      switch(action.type) {
        case 'redirect':
          if (action.url) {
            // Add a notification about the redirect
            addBotMessage(`I'll take you to ${action.description || 'the requested page'}.`);
            setTimeout(() => {
              window.location.href = action.url;
            }, 1500);
          }
          break;
          
        case 'createGoal':
          // Show confirmation before creating
          if (confirm(`Would you like to create a new goal: ${action.title}?`)) {
            createGoal(action);
          }
          break;
          
        case 'updateProgress':
          updateGoalProgress(action);
          break;
      }
    });
  }

  // Create a new goal from AI suggestion
  function createGoal(goalData) {
    fetch('/api/goals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: goalData.title,
        description: goalData.description || '',
        category: goalData.category || 'personal',
        targetDate: goalData.targetDate || getDefaultTargetDate()
      }),
    })
    .then(response => response.json())
    .then(data => {
      if (data.id) {
        addBotMessage(`Great! I've created your new goal. You can view it <a href="/goals/detail/${data.id}">here</a>.`);
      } else {
        addBotMessage("I'm sorry, there was an error creating your goal.");
      }
    })
    .catch(error => {
      console.error('Error creating goal:', error);
      addBotMessage("I'm sorry, there was an error creating your goal.");
    });
  }

  // Update goal progress
  function updateGoalProgress(progressData) {
    fetch(`/api/goals/${progressData.goalId}/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: progressData.content,
        mood: progressData.mood || 'neutral'
      }),
    })
    .then(response => response.json())
    .then(data => {
      if (data.id) {
        addBotMessage("I've updated your goal progress. Keep up the good work!");
      } else {
        addBotMessage("I'm sorry, there was an error updating your progress.");
      }
    })
    .catch(error => {
      console.error('Error updating progress:', error);
      addBotMessage("I'm sorry, there was an error updating your progress.");
    });
  }

  // Get default target date (3 months from now)
  function getDefaultTargetDate() {
    const date = new Date();
    date.setMonth(date.getMonth() + 3);
    return date.toISOString().split('T')[0];
  }
}); 