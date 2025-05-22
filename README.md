# Goal Tracker

A comprehensive goal tracking application with AI-powered milestone generation and a community platform for goal sharing.

## Features

- **Goal Management**: Create, track, and complete personal and professional goals
- **AI-Powered Assistant**: Six AI features to enhance your goal achievement
  - AI Goal Assistant: Create SMART goals with AI guidance
  - Automated Goal Breakdown: Generate step-by-step action plans
  - Motivational Nudges: Receive personalized coaching messages
  - Goal Completion Forecasting: Predict success likelihood with recommendations
  - Progress Insights & Reports: Get AI analytics on your goal patterns
  - Natural Language Logging: Update progress using conversational language
- **Community Features**: Share goals, posts, and encourage others
- **Subscription Plans**: Free, Monthly (£10), and Annual (£100) options
- **Stripe Integration**: Secure payment processing
- **Admin Dashboard**: User and content management capabilities

## Tech Stack

- Node.js and Express
- EJS templating
- SQLite database
- Stripe payment processing
- OpenAI integration

## Installation

1. Clone the repository
```
git clone https://github.com/yourusername/goal-tracker.git
cd goal-tracker
```

2. Install dependencies
```
npm install
```

3. Create a `.env` file based on `env.sample`
```
cp env.sample .env
```

4. Update the `.env` file with your credentials
   - Generate a strong SESSION_SECRET
   - Add your Stripe API keys
   - Add your OpenAI API key
   - Configure email settings if needed

5. Run the application in development mode
```
npm run dev
```

## Deployment

### Option 1: Render.com (Recommended)

1. Create an account on [Render](https://render.com)
2. Click "New Web Service" and connect your repository
3. Configure settings:
   - Name: goal-tracker (or your preferred name)
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add your environment variables in the "Environment" section
5. Set Region and Instance Type
6. Click "Create Web Service"

### Option 2: Railway.app

1. Create an account on [Railway](https://railway.app)
2. Create a new project and connect your repository
3. Add your environment variables
4. Deploy using the automatic deployment

### Option 3: Heroku

1. Create an account on [Heroku](https://heroku.com)
2. Install the Heroku CLI: `npm install -g heroku`
3. Login to Heroku: `heroku login`
4. Create a new app: `heroku create goal-tracker-app`
5. Push to Heroku: `git push heroku main`
6. Set environment variables:
```
heroku config:set SESSION_SECRET=your_secret
heroku config:set STRIPE_SECRET_KEY=your_key
```

## Production Considerations

1. **Database**: The application uses SQLite which stores data in files. For a production environment:
   - Ensure your hosting provider persists the database files
   - Consider migrating to PostgreSQL for higher traffic applications

2. **Environment Variables**: Make sure to set all required environment variables in your hosting provider's dashboard.

3. **Security**: 
   - Set NODE_ENV=production
   - Ensure SESSION_SECRET is strong and unique
   - Use SSL/HTTPS in production

4. **Stripe Webhook**: After deployment, update your Stripe webhook endpoint to point to your new domain.

## License

MIT

## Project Structure

- `app.js` - Main application file
- `models/` - Database models
- `routes/` - Route handlers
- `views/` - EJS templates
- `public/` - Static files

## Security Features

- Password hashing using bcrypt
- Session-based authentication
- Protected routes
- MongoDB for secure data storage 