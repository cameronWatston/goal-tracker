const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

// Make sure environment variables are loaded
dotenv.config();

// Create a transporter object with fallback mechanism
let transporter;

// Try to create email transporter if credentials are available
try {
    // Log environment variables for debugging (without revealing full credentials)
    if (process.env.EMAIL_USER) {
        const emailUser = process.env.EMAIL_USER;
        console.log(`Found EMAIL_USER: ${emailUser.substring(0, 3)}...${emailUser.split('@')[1] || ''}`);
    } else {
        console.log('EMAIL_USER not found in environment');
    }
    
    if (process.env.EMAIL_PASS) {
        console.log('EMAIL_PASS is set in environment');
    } else {
        console.log('EMAIL_PASS not found in environment');
    }
    
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE || 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS // This should be an app password for Gmail
            }
        });
        console.log('Email service configured with provided credentials');
    } else {
        console.log('Email credentials not provided in environment variables');
        // Use a preview mode instead (logs to console) for development
        transporter = {
            sendMail: (mailOptions) => {
                console.log('Email sending disabled - would have sent:');
                console.log(`From: ${mailOptions.from}`);
                console.log(`To: ${mailOptions.to}`);
                console.log(`Subject: ${mailOptions.subject}`);
                console.log('Email content would be displayed to user here');
                return Promise.resolve({ messageId: 'preview-mode' });
            }
        };
    }
} catch (error) {
    console.error('Error configuring email service:', error);
    // Fallback to preview mode
    transporter = {
        sendMail: (mailOptions) => {
            console.log('Email sending failed - would have sent:');
            console.log(`To: ${mailOptions.to}, Subject: ${mailOptions.subject}`);
            return Promise.resolve({ messageId: 'preview-mode' });
        }
    };
}

// Verification email template
const sendVerificationEmail = async (user, verificationCode) => {
    try {
        // Email content
        const mailOptions = {
            from: process.env.EMAIL_USER || 'Goal Tracker <noreply@goaltracker.example.com>',
            to: user.email,
            subject: 'Verify Your Goal Tracker Account',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #183B4E;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h1 style="color: #27548A;">Verify Your Email</h1>
                    </div>
                    
                    <p>Hello ${user.username},</p>
                    
                    <p>Thank you for signing up for Goal Tracker! To complete your registration, please verify your email address by entering the verification code below:</p>
                    
                    <div style="background-color: #F3F3E0; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center;">
                        <p style="margin: 0; color: #183B4E; font-size: 24px; letter-spacing: 5px; font-weight: bold;">
                            ${verificationCode}
                        </p>
                    </div>
                    
                    <p>This code will expire in 30 minutes. If you did not sign up for a Goal Tracker account, please ignore this email.</p>
                    
                    <p>Best regards,<br>The Goal Tracker Team</p>
                    
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #DDA853; font-size: 12px; color: #777;">
                        <p>This email was sent to ${user.email}. If you did not sign up for Goal Tracker, please ignore this email.</p>
                    </div>
                </div>
            `
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);
        console.log('Verification email sent:', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending verification email:', error);
        // Don't throw the error to prevent blocking registration if email fails
    }
};

// Welcome email template
const sendWelcomeEmail = async (user) => {
    try {
        // Email content
        const mailOptions = {
            from: process.env.EMAIL_USER || 'Goal Tracker <noreply@goaltracker.example.com>',
            to: user.email,
            subject: 'Welcome to Goal Tracker!',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #183B4E;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h1 style="color: #27548A;">Welcome to Goal Tracker!</h1>
                    </div>
                    
                    <p>Hello ${user.username},</p>
                    
                    <p>Thank you for joining Goal Tracker! We're excited to help you achieve your goals with our AI-powered platform.</p>
                    
                    <p>Here's what you can do now:</p>
                    
                    <ul>
                        <li>Set up your first goal</li>
                        <li>Get AI-generated milestones</li>
                        <li>Track your progress</li>
                    </ul>
                    
                    <div style="background-color: #F3F3E0; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p style="margin: 0; color: #183B4E;">
                            <strong>TIP:</strong> Be specific with your goal descriptions to get better AI-generated milestones.
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.APP_URL || 'http://localhost:3001'}/dashboard" style="background-color: #27548A; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                            Go to Your Dashboard
                        </a>
                    </div>
                    
                    <p>If you have any questions or need assistance, feel free to reply to this email.</p>
                    
                    <p>Best regards,<br>The Goal Tracker Team</p>
                    
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #DDA853; font-size: 12px; color: #777;">
                        <p>This email was sent to ${user.email}. If you did not sign up for Goal Tracker, please ignore this email.</p>
                    </div>
                </div>
            `
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);
        console.log('Welcome email sent:', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending welcome email:', error);
        // Don't throw the error to prevent blocking registration if email fails
    }
};

// Password reset email template
const sendPasswordResetEmail = async (user, resetToken) => {
    try {
        const resetUrl = `${process.env.APP_URL || 'http://localhost:3001'}/reset-password/${resetToken}`;
        
        // Email content
        const mailOptions = {
            from: process.env.EMAIL_USER || 'Goal Tracker <noreply@goaltracker.example.com>',
            to: user.email,
            subject: 'Reset Your Goal Tracker Password',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #183B4E;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h1 style="color: #27548A;">Reset Your Password</h1>
                    </div>
                    
                    <p>Hello ${user.username},</p>
                    
                    <p>We received a request to reset your password for your Goal Tracker account. If you made this request, click the button below to create a new password:</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" style="background-color: #27548A; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                            Reset Your Password
                        </a>
                    </div>
                    
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; background-color: #F3F3E0; padding: 10px; border-radius: 5px; font-family: monospace;">
                        ${resetUrl}
                    </p>
                    
                    <div style="background-color: #FFE5E5; border-left: 4px solid #FF6B6B; padding: 15px; margin: 20px 0;">
                        <p style="margin: 0; color: #D63031;">
                            <strong>Security Notice:</strong><br>
                            • This link will expire in 1 hour for security reasons<br>
                            • If you didn't request this reset, please ignore this email<br>
                            • Your password will remain unchanged unless you click the link above
                        </p>
                    </div>
                    
                    <p>If you continue to have trouble accessing your account, please contact our support team by replying to this email.</p>
                    
                    <p>Best regards,<br>The Goal Tracker Team</p>
                    
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #DDA853; font-size: 12px; color: #777;">
                        <p>This email was sent to ${user.email}. If you did not request a password reset, please ignore this email.</p>
                        <p>For security questions, contact us at goaltrackers2001@gmail.com</p>
                    </div>
                </div>
            `
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);
        console.log('Password reset email sent:', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending password reset email:', error);
        throw error; // Throw error for password reset as it's critical
    }
};

module.exports = {
    sendVerificationEmail,
    sendWelcomeEmail,
    sendPasswordResetEmail
}; 