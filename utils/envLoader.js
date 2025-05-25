const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
function loadEnvVariables() {
    try {
        // Try to load from .env file
        const result = dotenv.config();
        
        if (result.error) {
            console.error('Error loading .env file:', result.error.message);
            return false;
        }
        
        // Check if .env file exists
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            console.log('✅ .env file found and loaded');
            
            // Check for common environment variables
            const requiredVars = [
                { name: 'STRIPE_SECRET_KEY', prefix: 'sk_' },
                { name: 'STRIPE_PUBLISHABLE_KEY', prefix: 'pk_' },
                { name: 'OPENAI_API_KEY', prefix: 'sk' },
                { name: 'EMAIL_USER', check: (val) => val && val.includes('@') },
                { name: 'EMAIL_PASS', check: (val) => !!val },
                { name: 'GOOGLE_ADSENSE_CLIENT_ID', prefix: 'ca-pub-' }
            ];
            
            let allVarsPresent = true;
            
            for (const reqVar of requiredVars) {
                const value = process.env[reqVar.name];
                
                if (!value) {
                    console.log(`⚠️ ${reqVar.name} is missing from environment variables`);
                    allVarsPresent = false;
                    continue;
                }
                
                // Check value format if needed
                if (reqVar.prefix && !value.startsWith(reqVar.prefix)) {
                    console.log(`⚠️ ${reqVar.name} does not have the expected format (should start with ${reqVar.prefix})`);
                    allVarsPresent = false;
                    continue;
                }
                
                if (reqVar.check && !reqVar.check(value)) {
                    console.log(`⚠️ ${reqVar.name} does not have a valid format`);
                    allVarsPresent = false;
                    continue;
                }
                
                // Mask the value for security
                let maskedValue;
                if (value.length > 8) {
                    maskedValue = `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
                } else {
                    maskedValue = '****';
                }
                
                console.log(`✅ ${reqVar.name} is set: ${maskedValue}`);
            }
            
            if (allVarsPresent) {
                console.log('✅ All required environment variables are set correctly');
            } else {
                console.log('⚠️ Some environment variables are missing or invalid');
            }
            
            return true;
        } else {
            console.error('❌ .env file not found at', envPath);
            console.log('Creating example .env file...');
            
            // Create example .env file
            const exampleEnv = `# Application
PORT=3001
NODE_ENV=development
SESSION_SECRET=your_session_secret_key_here
APP_URL=http://localhost:3001

# Email (configure for Gmail or your preferred service)
EMAIL_USER=your.email@gmail.com
EMAIL_PASS=your_app_password

# Stripe API for payments
# Get your keys from https://dashboard.stripe.com/test/apikeys
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here

# OpenAI API for milestone generation
OPENAI_API_KEY=sk-your_openai_key_here
`;
            fs.writeFileSync(path.resolve(process.cwd(), '.env.example'), exampleEnv);
            console.log('✅ Created .env.example file. Rename it to .env and add your keys.');
            return false;
        }
    } catch (error) {
        console.error('Error during environment variables loading:', error);
        return false;
    }
}

// Export the function
module.exports = {
    loadEnvVariables
}; 