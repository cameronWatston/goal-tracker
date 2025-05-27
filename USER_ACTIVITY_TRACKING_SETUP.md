# 🕵️ User Activity Tracking System Setup

This guide will help you implement comprehensive user activity tracking for your admin dashboard so you can see when users were last active, what they're doing, and analyze engagement patterns.

## 🚀 Quick Setup

### 1. Run Database Migration

First, run the migration to add activity tracking to your database:

```bash
node scripts/migrate-user-activity.js
```

This will:
- ✅ Add `last_activity`, `last_login`, `total_sessions`, `last_ip_address` columns to users table
- ✅ Create `user_activity_logs` table for detailed activity tracking
- ✅ Add indexes for optimal performance
- ✅ Set default values for existing users

### 2. Add Activity Tracking Middleware

In your `app.js`, add the activity tracking middleware:

```javascript
const { trackUserActivity } = require('./middleware/activityTracker');

// Add this middleware AFTER session middleware but BEFORE routes
app.use(trackUserActivity);
```

### 3. Update Authentication Routes

Update your login route to track user sessions:

```javascript
const { trackUserLogin } = require('./middleware/activityTracker');

// In your login route after successful authentication:
app.post('/login', async (req, res) => {
    // ... existing login logic ...
    
    if (loginSuccessful) {
        // Track the login
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || '';
        
        await trackUserLogin(user.id, ipAddress, userAgent);
        
        // ... rest of login logic ...
    }
});
```

Update your logout route:

```javascript
const { trackUserLogout } = require('./middleware/activityTracker');

// In your logout route:
app.post('/logout', async (req, res) => {
    if (req.session.user) {
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || '';
        
        await trackUserLogout(req.session.user.id, ipAddress, userAgent);
    }
    
    // ... existing logout logic ...
});
```

### 4. Track Goal Activities (Optional)

Add goal activity tracking to your goal routes:

```javascript
const { trackGoalActivity } = require('./middleware/activityTracker');

// Example: Track goal creation
app.post('/api/goals', async (req, res) => {
    // ... create goal logic ...
    
    if (newGoal) {
        await trackGoalActivity(
            req.session.user.id, 
            'create', 
            newGoal.id, 
            'Created new goal', 
            req
        );
    }
    
    // ... rest of logic ...
});
```

## 📊 Admin Features

### Access User Activity Analytics

1. **Main Analytics Dashboard**: `/admin/user-activity`
   - Active users (24h, 7d, 30d)
   - Currently online users
   - Activity trends by hour
   - Most active users

2. **Individual User Activity**: `/admin/users/{userId}/activity`
   - Detailed activity logs for specific user
   - Activity statistics and patterns
   - Session history

3. **Enhanced User List**: `/admin/users`
   - Last activity timestamps
   - Online status indicators
   - Activity-based sorting

### Activity Data You'll See

**User Status Indicators:**
- 🟢 **Online** - Active in last 5 minutes
- 🟡 **Recently Active** - Active in last 30 minutes
- 🔵 **Today** - Active today
- ⚪ **Offline** - Not active recently

**Activity Types Tracked:**
- `login` - User login events
- `logout` - User logout events
- `page_view` - Page visits (automatically tracked)
- `goal_action` - Goal-related activities
- `post_action` - Community/post activities

**Metrics Available:**
- Last activity timestamp
- Last login time
- Total sessions count
- IP address tracking
- User agent information
- Activity patterns and trends

## 🎯 Features Included

### ✨ Real-time Activity Monitoring
- **Live Online Users**: See who's currently active
- **Activity Timeline**: Hour-by-hour activity charts
- **Recent Activities**: Latest user actions across the platform

### 📈 Analytics Dashboard
- **Activity Heatmaps**: Visual representation of when users are most active
- **Engagement Metrics**: Track user engagement patterns
- **User Behavior Analysis**: Understand how users interact with your platform

### 🔍 Detailed User Insights
- **Individual Activity Logs**: Complete activity history per user
- **Session Analytics**: Login patterns and session durations
- **Geographic Insights**: IP-based location tracking

### 🚨 Admin Alerts
- **Inactive Users**: Identify users who haven't been active
- **Unusual Activity**: Spot potential security issues
- **Engagement Trends**: Monitor platform health

## 🛠️ Customization Options

### Add Custom Activity Tracking

You can track custom activities anywhere in your app:

```javascript
const { logUserActivity } = require('./middleware/activityTracker');

// Track custom activity
await logUserActivity(
    userId, 
    'custom_action', 
    'User performed custom action', 
    ipAddress, 
    userAgent, 
    pageUrl
);
```

### Filter and Search Activities

The system includes powerful filtering options:

```javascript
// Get activities by type
const goalActivities = await new Promise((resolve, reject) => {
    db.all(`
        SELECT * FROM user_activity_logs 
        WHERE user_id = ? AND activity_type = 'goal_action'
        ORDER BY created_at DESC
    `, [userId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});
```

## 🔒 Privacy & Security

### Data Retention
- Activity logs are stored indefinitely by default
- Consider implementing data retention policies
- Regularly clean up old logs based on your requirements

### Privacy Compliance
- IP addresses are stored for security purposes
- User agents help identify device types
- Consider GDPR compliance for EU users

### Security Benefits
- **Intrusion Detection**: Unusual activity patterns
- **Account Security**: Monitor for suspicious logins
- **Audit Trail**: Complete activity history for compliance

## 🎨 UI Enhancements

The system includes beautiful admin interfaces:

### Enhanced User List
- **Visual Status Indicators**: Color-coded activity status
- **Quick Activity Access**: Direct links to user activity
- **Smart Sorting**: Sort by activity, status, engagement

### Analytics Charts
- **Interactive Charts**: Hover for detailed information
- **Real-time Updates**: Live activity monitoring
- **Responsive Design**: Works on all devices

### Activity Timeline
- **Visual Activity Feed**: See all recent activities
- **Filterable Views**: Filter by activity type, user, date
- **Export Capabilities**: Download activity reports

## 🚀 Getting Started

1. **Run the migration**: `node scripts/migrate-user-activity.js`
2. **Add middleware to app.js**
3. **Update login/logout routes**
4. **Visit `/admin/user-activity` to see analytics**
5. **Check `/admin/users` for enhanced user list**

## 📞 Need Help?

The system is designed to be plug-and-play, but if you need customization:

- Check the middleware files for configuration options
- Review the admin routes for API endpoints
- Examine the view templates for UI customization
- Monitor console logs for any issues

---

🎉 **Congratulations!** You now have a comprehensive user activity tracking system that gives you insights into user behavior, engagement patterns, and platform health. Your admin dashboard just became significantly more powerful! 📊✨ 