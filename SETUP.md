# Goal Tracker Setup Guide

## Environment Variables Setup

To enable all features including the new AI chat functionality, create a `.env` file in the root directory with the following variables:

```env
# Database Configuration
DATABASE_URL=

# Session Configuration
SESSION_SECRET=your-very-secret-session-key-here

# Stripe Configuration (for paid subscriptions)
STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret

# Email Configuration (for verification emails)
EMAIL_HOST=
EMAIL_PORT=
EMAIL_USER=
EMAIL_PASS=

# OpenAI Configuration (Required for AI Chat feature)
OPENAI_API_KEY=your-openai-api-key-here

# Application Configuration
NODE_ENV=development
PORT=3001

# Domain Configuration (for production)
DOMAIN=localhost:3001
```

## OpenAI API Key Setup

1. Go to [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Create a new API key
3. Copy the key and add it to your `.env` file as `OPENAI_API_KEY`
4. Make sure you have billing set up in your OpenAI account

## New Features

### 🔍 Community Search
- **Hashtag Search**: Use `#hashtag` to find posts by topic
- **User Search**: Find other community members
- **Goal Search**: Search your personal goals
- **Content Search**: Full-text search across all posts

### 🤖 AI Assistant (Pro Only)
- **SMART Goal Creation**: Get help creating Specific, Measurable, Achievable, Relevant, Time-bound goals
- **Goal Breakdown**: Break large goals into smaller milestones
- **Motivation Support**: Get personalized motivation and accountability tips
- **Obstacle Assistance**: Help overcoming challenges and setbacks
- **Productivity Advice**: Time management and productivity recommendations

### 🎯 Enhanced Navbar
- **Quick Post**: Create posts directly from the navbar
- **Smart Notifications**: Real-time notifications with badge counts
- **User Stats**: View your goal progress in the dropdown
- **Mobile Responsive**: Fully functional on mobile devices

## Running the Application

1. Install dependencies: `npm install`
2. Set up your `.env` file with the variables above
3. Start the server: `npm start`
4. Visit `http://localhost:3001`

## Pro Features

The AI Assistant requires a paid subscription (monthly or annual). Users with free accounts will see an upgrade prompt when trying to access AI features.

## Technical Implementation

- **Search API**: `/api/community/search` - Real-time search with filtering
- **AI Chat API**: `/api/ai/chat` - OpenAI GPT-3.5-turbo integration
- **Subscription Gating**: AI features restricted to paid users only
- **Real-time UI**: Debounced search, typing indicators, smooth animations 