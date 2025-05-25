# Environment Setup Guide

## 🔧 Setting Up Your .env File

Create a `.env` file in your project root with the following variables:

```bash
# Goal Tracker Environment Configuration

# Server Configuration
NODE_ENV=development
PORT=3001

# Session Security (generate a random secret for production)
SESSION_SECRET=your-super-secret-session-key-change-this-in-production

# Stripe Payment Configuration (for Premium subscriptions)
# Get these from your Stripe Dashboard: https://dashboard.stripe.com/test/apikeys
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here

# OpenAI API Configuration (for AI features)
# Get your API key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-proj-your-openai-api-key-here

# Email Configuration (for contact forms and notifications)
# Use Gmail App Password: https://support.google.com/accounts/answer/185833
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-16-character-app-password

# Google AdSense Configuration (for automatic ads)
# Get your AdSense client ID from: https://www.google.com/adsense/
# Format: ca-pub-xxxxxxxxxxxxxxxx (replace with your actual numbers)
GOOGLE_ADSENSE_CLIENT_ID=ca-pub-0000000000000000

# Database Configuration (leave as default for local development)
DATABASE_PATH=./db/database.sqlite

# Application URLs (update for production)
BASE_URL=http://localhost:3001
CANONICAL_URL=https://goaltracker.com

# Security Configuration
HELMET_CSP_ENABLED=false

# Debug Mode
DEBUG=false
```

## 🎯 Key Points for AdSense Setup

### 1. **Environment Variable is Required**
The `GOOGLE_ADSENSE_CLIENT_ID` must be set in your `.env` file for the automatic AdSense system to work properly.

### 2. **Getting Your AdSense Client ID**
1. Go to [Google AdSense](https://www.google.com/adsense/)
2. Sign in to your account
3. Go to "Ads" → "Overview"
4. Find your AdSense client ID (format: `ca-pub-xxxxxxxxxxxxxxxx`)
5. Copy the full ID including the `ca-pub-` prefix

### 3. **Testing vs Production**
- **Development**: Use `ca-pub-0000000000000000` (test mode)
- **Production**: Use your real AdSense client ID

### 4. **Security Best Practices**
- Never commit your `.env` file to Git
- Use different values for development/staging/production
- Keep your AdSense client ID secure

## 🚀 Quick Setup Commands

1. **Create your .env file:**
   ```bash
   # Copy the template above into a new .env file
   # Replace placeholder values with your actual credentials
   ```

2. **Start the application:**
   ```bash
   npm start
   ```

3. **Verify AdSense is working:**
   - Login as admin: `admin` / `admin123`
   - Go to Admin Dashboard → AdSense Analytics
   - Check that your client ID is displayed correctly

## ⚠️ Common Issues

### Port Already in Use
If you see "EADDRINUSE" error:
```bash
# Kill any existing Node processes
taskkill /f /im node.exe

# Or change the port in .env
PORT=3002
```

### AdSense Not Loading
- Ensure `GOOGLE_ADSENSE_CLIENT_ID` is set in `.env`
- Check that the format is correct: `ca-pub-xxxxxxxxxxxxxxxx`
- Verify you're logged in as a free user (premium users don't see ads)

### Email Not Working
- Use Gmail App Password, not your regular password
- Enable 2-factor authentication on Gmail first
- Generate app password from Google Account settings

## 🔄 Environment Variables Priority

The application loads environment variables in this order:
1. `.env` file (highest priority)
2. System environment variables
3. Default values in code (lowest priority)

This means your `.env` file will always override any default values! 