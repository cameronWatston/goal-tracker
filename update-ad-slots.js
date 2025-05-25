#!/usr/bin/env node

// Quick Ad Slot Updater for Production
// Run: node update-ad-slots.js [TOP_SLOT_ID] [BOTTOM_SLOT_ID]

const fs = require('fs');
const path = require('path');

console.log('🔧 AdSense Ad Slot Updater');
console.log('=========================');

// Get command line arguments
const args = process.argv.slice(2);

if (args.length !== 2) {
    console.log('\n❌ Usage: node update-ad-slots.js [TOP_SLOT_ID] [BOTTOM_SLOT_ID]');
    console.log('\nExample:');
    console.log('node update-ad-slots.js 1234567890 0987654321');
    console.log('\nGet your real ad slot IDs from:');
    console.log('https://www.google.com/adsense/ → Ads → By ad unit');
    process.exit(1);
}

const [topSlotId, bottomSlotId] = args;

// Validate slot IDs (should be numbers)
if (!/^\d{10}$/.test(topSlotId) || !/^\d{10}$/.test(bottomSlotId)) {
    console.log('❌ Ad slot IDs should be 10-digit numbers');
    console.log('Example: 1234567890');
    process.exit(1);
}

console.log(`\n🎯 Updating ad slots:`);
console.log(`Top Banner: ${topSlotId}`);
console.log(`Bottom Banner: ${bottomSlotId}`);

// File to update
const layoutFile = path.join(__dirname, 'views', 'layout.ejs');

if (!fs.existsSync(layoutFile)) {
    console.log('❌ layout.ejs not found at:', layoutFile);
    process.exit(1);
}

// Read the file
let content = fs.readFileSync(layoutFile, 'utf8');

// Replace test ad slots with real ones
content = content.replace(/data-ad-slot="1234567890"/g, `data-ad-slot="${topSlotId}"`);
content = content.replace(/data-ad-slot="9876543210"/g, `data-ad-slot="${bottomSlotId}"`);

// Write back to file
fs.writeFileSync(layoutFile, content);

console.log('\n✅ Ad slots updated successfully!');
console.log('\n📋 Next steps:');
console.log('1. Deploy to your production domain');
console.log('2. Add domain to AdSense account');
console.log('3. Test without ad blockers');
console.log('4. Wait 24-48 hours for ads to appear');

console.log('\n🚀 Your Goal Tracker is now ready for production with real AdSense ads!'); 