/**
 * Fix .env file script
 * This script reads the current .env file, removes any line breaks in values,
 * and writes a clean version back to disk.
 */

const fs = require('fs');
const path = require('path');

function fixEnvFile() {
    try {
        console.log('Starting .env file cleanup...');
        
        // Check if .env file exists
        const envPath = path.resolve(process.cwd(), '.env');
        if (!fs.existsSync(envPath)) {
            console.error('Error: .env file not found at', envPath);
            return;
        }
        
        // Read the current content
        const content = fs.readFileSync(envPath, 'utf8');
        
        // Fix line breaks in values
        let fixedContent = '';
        let currentLine = '';
        
        for (const line of content.split('\n')) {
            // Skip if empty line or comment
            if (!line.trim() || line.trim().startsWith('#')) {
                // Add previous line if exists
                if (currentLine) {
                    fixedContent += currentLine + '\n';
                    currentLine = '';
                }
                
                // Add comment or empty line
                fixedContent += line + '\n';
                continue;
            }
            
            // If we have no active line, start a new one
            if (!currentLine) {
                // Check if this is a key=value line
                if (line.includes('=')) {
                    currentLine = line;
                } else {
                    // Not a key=value line, just add as is
                    fixedContent += line + '\n';
                }
            } else {
                // We already have an active line, this is a continuation
                currentLine += line.trim();
            }
            
            // If we have a complete line (ends with a comment or nothing)
            if (currentLine && !currentLine.trim().endsWith('\\')) {
                fixedContent += currentLine + '\n';
                currentLine = '';
            }
        }
        
        // Add any remaining line
        if (currentLine) {
            fixedContent += currentLine + '\n';
        }
        
        // Backup the original file
        const backupPath = envPath + '.backup';
        fs.copyFileSync(envPath, backupPath);
        console.log(`Backed up original .env file to ${backupPath}`);
        
        // Write the fixed content
        fs.writeFileSync(envPath, fixedContent);
        console.log('Successfully fixed .env file!');
        console.log('Please restart your application to apply the changes.');
    } catch (error) {
        console.error('Error fixing .env file:', error);
    }
}

// Run the function if this script is executed directly
if (require.main === module) {
    fixEnvFile();
}

module.exports = { fixEnvFile }; 