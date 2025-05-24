# Banner Ads System Documentation

## Overview

A comprehensive banner ad system has been added to your Goal Tracker website with multiple layouts, responsive design, and advanced features.

## Files Added/Modified

### New Files Created:
- `views/partials/banner-ad.ejs` - Main banner ad component
- `public/css/banner-ads.css` - Banner ad styling
- `views/banner-demo.ejs` - Demo page showcasing all banner types
- `public/img/banner-ad-1.svg` - Premium tools banner image
- `public/img/banner-ad-2.svg` - Productivity banner image  
- `public/img/banner-ad-3.svg` - Community banner image
- `public/img/premium-features.svg` - Premium features banner image

### Files Modified:
- `views/layout.ejs` - Added CSS link and banner ad placements
- `app.js` - Added demo route and analytics endpoint

## Banner Ad Types

### 1. Horizontal Banner (Default)
```ejs
<%- include('partials/banner-ad', { 
    type: 'horizontal',
    ads: [{ /* ad data */ }]
}) %>
```

### 2. Vertical Banner
```ejs
<%- include('partials/banner-ad', { 
    type: 'vertical',
    ads: [{ /* ad data */ }]
}) %>
```

### 3. Square Banner
```ejs
<%- include('partials/banner-ad', { 
    type: 'square',
    ads: [{ /* ad data */ }]
}) %>
```

### 4. Featured Banner (Gradient Background)
```ejs
<%- include('partials/banner-ad', { 
    type: 'featured',
    ads: [{ /* ad data */ }]
}) %>
```

### 5. Minimal Banner (Subtle Design)
```ejs
<%- include('partials/banner-ad', { 
    type: 'minimal',
    ads: [{ /* ad data */ }]
}) %>
```

### 6. Special Position Banners
- `sticky-top` - Fixed at top of page
- `sidebar` - Sticky sidebar placement
- `footer-banner` - Fixed bottom-right corner

## Ad Data Structure

```javascript
{
    id: 'unique-ad-id',           // Required: Unique identifier
    title: 'Ad Title',            // Required: Main headline
    description: 'Ad description', // Required: Supporting text
    image: '/img/ad-image.svg',   // Optional: Image path
    link: '/target-page',         // Optional: Click destination
    buttonText: 'Click Here',     // Optional: Button text
    type: 'internal'              // Optional: 'internal' or 'external'
}
```

## Usage Examples

### Random Banner from Defaults
```ejs
<%- include('partials/banner-ad', { 
    type: 'horizontal',
    random: true
}) %>
```

### Custom Ad
```ejs
<%- include('partials/banner-ad', { 
    type: 'featured',
    ads: [{
        id: 'custom-ad',
        title: 'Special Offer!',
        description: 'Limited time discount on premium features',
        image: '/img/special-offer.svg',
        link: '/subscription',
        buttonText: 'Get 50% Off',
        type: 'internal'
    }]
}) %>
```

### Conditional Display
```ejs
<!-- Only show to free users -->
<% if (user && user.subscription_plan !== 'monthly' && user.subscription_plan !== 'annual') { %>
    <%- include('partials/banner-ad', { 
        type: 'featured',
        ads: [{ /* upgrade ad */ }]
    }) %>
<% } %>
```

## Current Placements

1. **Top of Main Content** - Random banner for logged-in users
2. **Bottom of Main Content** - Upgrade banner for free users only

## Features

### ✅ Responsive Design
- Adapts to all screen sizes
- Mobile-optimized layouts
- Touch-friendly interactions

### ✅ User Experience
- Closeable ads (remembers for 24 hours)
- Smooth animations
- Non-intrusive design

### ✅ Analytics Ready
- Click tracking with `trackAdClick()` function
- Google Analytics integration ready
- Custom analytics endpoint at `/api/track-ad-click`

### ✅ Customizable
- Multiple layout options
- Easy styling modifications
- Flexible content structure

### ✅ Smart Targeting
- User status-based display
- Conditional rendering
- Random ad selection

## Customization

### Adding New Banner Types
1. Create new CSS classes in `banner-ads.css`
2. Add type checking in `banner-ad.ejs`
3. Test with different screen sizes

### Modifying Colors
Edit CSS variables in `banner-ads.css`:
```css
:root {
    --banner-primary: #667eea;
    --banner-secondary: #764ba2;
    /* ... */
}
```

### Adding New Images
1. Create SVG files in `public/img/`
2. Update ad data to reference new images
3. Optimize for web delivery

## Demo Page

Visit `/banner-demo` to see all banner types in action and test different layouts.

## Analytics Integration

### Google Analytics
The system includes automatic Google Analytics event tracking:
```javascript
gtag('event', 'ad_click', {
    'ad_id': adId,
    'event_category': 'advertisement'
});
```

### Custom Analytics
Clicks are also sent to `/api/track-ad-click` for custom tracking.

## Performance Considerations

- Images use lazy loading
- Animations are GPU-accelerated
- CSS is optimized for minimal repaints
- LocalStorage used for user preferences

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Chrome Mobile)
- Graceful degradation for older browsers

## Future Enhancements

Potential additions you could implement:

1. **A/B Testing** - Show different ads to different users
2. **Database Storage** - Store ad data in database for dynamic management
3. **Admin Panel** - Manage ads through web interface
4. **Advanced Targeting** - Location, time-based, behavior-based targeting
5. **Revenue Tracking** - Integration with advertising networks
6. **Performance Metrics** - Click-through rates, conversion tracking

## Troubleshooting

### Ads Not Showing
1. Check if CSS file is loaded
2. Verify EJS include syntax
3. Check browser console for errors

### Styling Issues
1. Clear browser cache
2. Check CSS specificity conflicts
3. Test on different screen sizes

### Analytics Not Working
1. Verify Google Analytics is installed
2. Check network requests in DevTools
3. Confirm endpoint URLs are correct 