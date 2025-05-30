const path = require('path');
const fs = require('fs');

/**
 * Database Configuration Helper
 * Handles both local development (./db) and persistent disk (/data) paths
 */
class DatabaseConfig {
    constructor() {
        // Use persistent disk path if available, otherwise default to local db directory
        this.baseDir = process.env.DB_PATH || path.join(__dirname, '..', 'db');
        this.ensureDirectoryExists();
    }

    ensureDirectoryExists() {
        try {
            if (!fs.existsSync(this.baseDir)) {
                fs.mkdirSync(this.baseDir, { recursive: true });
                console.log(`📁 Created database directory: ${this.baseDir}`);
            }
        } catch (error) {
            console.error('❌ Failed to create database directory:', error);
            // Fallback to local directory if persistent disk fails
            this.baseDir = path.join(__dirname, '..', 'db');
            if (!fs.existsSync(this.baseDir)) {
                fs.mkdirSync(this.baseDir, { recursive: true });
            }
        }
    }

    getDatabasePath() {
        if (process.env.RENDER) {
            // Use Render's persistent disk path
            return path.join('/data', 'database.sqlite');
        }
        // Local development path
        return path.join(this.baseDir, 'database.sqlite');
    }

    getSessionPath() {
        if (process.env.RENDER) {
            // Use Render's persistent disk path
            return '/data';
        }
        // Local development path
        return this.baseDir;
    }

    getSessionDatabase() {
        return 'sessions.sqlite';
    }

    getBackupPath(filename) {
        return path.join(this.baseDir, filename);
    }

    // Log current configuration
    logConfig() {
        const isPersistent = !!process.env.DB_PATH;
        console.log('🗄️  Database Configuration:');
        console.log(`   Type: ${isPersistent ? 'Persistent Disk' : 'Local Storage'}`);
        console.log(`   Path: ${this.baseDir}`);
        console.log(`   Database: ${this.getDatabasePath()}`);
        console.log(`   Sessions: ${path.join(this.getSessionPath(), this.getSessionDatabase())}`);
        console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`   Render: ${process.env.RENDER ? 'Yes' : 'No'}`);
    }
}

module.exports = new DatabaseConfig(); 