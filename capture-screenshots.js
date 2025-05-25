const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function captureScreenshots() {
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: {
            width: 1920,
            height: 1080
        }
    });
    
    const page = await browser.newPage();
    
    // Ensure imgs directory exists
    const imgsDir = path.join(__dirname, 'imgs');
    if (!fs.existsSync(imgsDir)) {
        fs.mkdirSync(imgsDir);
    }
    
    console.log('Starting screenshot capture...');
    
    // Wait a bit for server to fully start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const baseUrl = 'http://localhost:3001';
    
    // Pages to screenshot
    const pages = [
        { url: '/', name: 'home-page' },
        { url: '/login', name: 'login-page' },
        { url: '/register', name: 'register-page' },
        { url: '/contact', name: 'contact-page' },
        { url: '/forgot-password', name: 'forgot-password-page' },
        { url: '/admin', name: 'admin-dashboard', needsAuth: true },
        { url: '/admin/seo', name: 'admin-seo', needsAuth: true }
    ];
    
    for (const pageInfo of pages) {
        try {
            console.log(`Capturing screenshot of ${pageInfo.url}...`);
            
            // Navigate to page
            await page.goto(`${baseUrl}${pageInfo.url}`, { 
                waitUntil: 'networkidle2',
                timeout: 10000 
            });
            
            // Wait for page to fully load
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Take full page screenshot
            const screenshotPath = path.join(imgsDir, `${pageInfo.name}-full.png`);
            await page.screenshot({ 
                path: screenshotPath, 
                fullPage: true,
                type: 'png'
            });
            
            // Take viewport screenshot
            const viewportPath = path.join(imgsDir, `${pageInfo.name}-viewport.png`);
            await page.screenshot({ 
                path: viewportPath, 
                fullPage: false,
                type: 'png'
            });
            
            console.log(`✅ Screenshots saved: ${pageInfo.name}`);
            
        } catch (error) {
            console.error(`❌ Error capturing ${pageInfo.url}:`, error.message);
        }
    }
    
    // Take mobile screenshots
    console.log('Capturing mobile screenshots...');
    await page.setViewport({ width: 375, height: 667 }); // iPhone size
    
    for (const pageInfo of pages) {
        try {
            console.log(`Capturing mobile screenshot of ${pageInfo.url}...`);
            
            await page.goto(`${baseUrl}${pageInfo.url}`, { 
                waitUntil: 'networkidle2',
                timeout: 10000 
            });
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const mobilePath = path.join(imgsDir, `${pageInfo.name}-mobile.png`);
            await page.screenshot({ 
                path: mobilePath, 
                fullPage: true,
                type: 'png'
            });
            
            console.log(`✅ Mobile screenshot saved: ${pageInfo.name}`);
            
        } catch (error) {
            console.error(`❌ Error capturing mobile ${pageInfo.url}:`, error.message);
        }
    }
    
    await browser.close();
    console.log('🎉 Screenshot capture complete! Check the imgs/ directory.');
}

// Run the capture
captureScreenshots().catch(console.error); 