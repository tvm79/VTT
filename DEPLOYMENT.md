# VTT Production Deployment Guide

This guide will help you deploy your Virtual Tabletop app to a production server.

## Prerequisites

1. **Node.js** (v18 or higher)
2. **PostgreSQL** database
3. **PM2** for process management (optional but recommended)

## Environment Variables

Create a `.env` file in the `server/` directory with production values:

```bash
# Database - UPDATE THESE VALUES for your production database
DATABASE_URL="postgresql://username:password@your-db-host:5432/vtt?schema=public"

# JWT Secret - Generate a secure random string (use openssl rand -hex 32)
JWT_SECRET="your-super-secret-jwt-key-change-in-production"

# Server
PORT=3001
NODE_ENV=production

# File Upload
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE=10485760  # 10MB

# CORS - Set this to your production domain
CORS_ORIGIN="https://your-domain.com"
```

## Build Steps

### 1. Install Dependencies

```bash
# Install root dependencies
npm install

# Install workspace dependencies
npm install
```

### 2. Build the Application

```bash
# Build both client and server
npm run build
```

This will:
- Build the client to `client/dist`
- Build the server to `server/dist`

### 3. Generate Prisma Client (if needed)

```bash
npm run db:generate
```

### 4. Push Database Schema

```bash
npm run db:push
```

## Running in Production

### Option A: Using PM2 (Recommended)

```bash
# Start the server with PM2
cd server
pm2 start dist/index.js --name vtt-server

# Set environment variables
pm2 set vtt-server:NODE_ENV production
pm2 set vtt-server:PORT 3001
pm2 set vtt-server:DATABASE_URL "your-production-database-url"
pm2 set vtt-server:JWT_SECRET "your-jwt-secret"
pm2 set vtt-server:CORS_ORIGIN "https://your-domain.com"

# Restart to apply environment variables
pm2 restart vtt-server
```

### Option B: Using Node Directly

```bash
cd server
NODE_ENV=production PORT=3001 DATABASE_URL="your-db-url" JWT_SECRET="your-secret" CORS_ORIGIN="https://your-domain.com" npm run start
```

## Using with Nginx

If you want to use Nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Client files are served by the Express server
    # But you can also serve them directly with Nginx for better performance
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## HTTPS Setup

For production, you should use HTTPS. You can use:

1. **Let's Encrypt** with Certbot
2. **Nginx** reverse proxy with SSL
3. **Cloudflare** CDN

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running
- Check DATABASE_URL format
- Verify database user has proper permissions

### Socket Connection Issues
- Check CORS_ORIGIN matches your domain exactly
- Ensure WebSocket proxy is configured (if using Nginx)
- Check firewall settings

### Static Files Not Loading
- Verify `client/dist` folder exists
- Check that `NODE_ENV=production` is set
- Ensure the server has read permissions on the dist folder

## Quick Deploy Script

Create a `deploy.sh` script:

```bash
#!/bin/bash
set -e

echo "Building application..."
npm run build

echo "Generating Prisma client..."
npm run db:generate

echo "Pushing database schema..."
npm run db:push

echo "Starting server..."
cd server
NODE_ENV=production pm2 restart vtt-server || pm2 start dist/index.js --name vtt-server
```

Make it executable: `chmod +x deploy.sh`

Then run: `./deploy.sh`
