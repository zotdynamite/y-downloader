#!/bin/bash

# YouTube Downloader Deployment Script
# This script helps you deploy to various platforms

echo "🚀 YouTube Downloader Deployment Script"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if git is available
check_git() {
    if ! command -v git &> /dev/null; then
        print_error "Git is not installed. Please install Git first."
        exit 1
    fi
}

# Check if npm is available
check_npm() {
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install Node.js first."
        exit 1
    fi
}

# Build frontend for production
build_frontend() {
    print_status "Building frontend for production..."
    cd frontend
    npm install
    npm run build
    if [ $? -eq 0 ]; then
        print_status "Frontend built successfully!"
    else
        print_error "Frontend build failed!"
        exit 1
    fi
    cd ..
}

# Install backend dependencies
prepare_backend() {
    print_status "Preparing backend..."
    cd backend
    npm install
    if [ $? -eq 0 ]; then
        print_status "Backend dependencies installed!"
    else
        print_error "Backend dependency installation failed!"
        exit 1
    fi
    cd ..
}

# Git operations
commit_and_push() {
    print_status "Committing changes to git..."
    git add .
    git commit -m "Deployment ready - $(date)"
    
    if git remote -v | grep -q origin; then
        print_status "Pushing to origin..."
        git push origin main
    else
        print_warning "No git remote 'origin' found. Please set up your git remote first."
        echo "Run: git remote add origin https://github.com/yourusername/your-repo.git"
    fi
}

# Main deployment options
deploy_menu() {
    echo ""
    echo "Choose deployment option:"
    echo "1) 🏗️  Prepare for deployment (build + commit)"
    echo "2) 🌐 Deploy to Railway + Netlify (Recommended)"
    echo "3) 🐳 Generate Docker deployment"
    echo "4) ☁️  Deploy to Vercel + Railway"
    echo "5) 📋 Show deployment checklist"
    echo "6) ❌ Exit"
    echo ""
    
    read -p "Enter your choice (1-6): " choice
    
    case $choice in
        1)
            prepare_for_deployment
            ;;
        2)
            deploy_railway_netlify
            ;;
        3)
            docker_deployment
            ;;
        4)
            deploy_vercel_railway
            ;;
        5)
            show_checklist
            ;;
        6)
            echo "👋 Goodbye!"
            exit 0
            ;;
        *)
            print_error "Invalid choice. Please try again."
            deploy_menu
            ;;
    esac
}

prepare_for_deployment() {
    print_status "Preparing for deployment..."
    check_npm
    build_frontend
    prepare_backend
    check_git
    commit_and_push
    print_status "✅ Ready for deployment!"
    show_next_steps
}

deploy_railway_netlify() {
    print_status "🚂 Railway + Netlify Deployment Guide"
    echo ""
    echo "Backend (Railway):"
    echo "1. Go to https://railway.app"
    echo "2. Sign up/Login with GitHub"
    echo "3. 'New Project' → 'Deploy from GitHub repo'"
    echo "4. Select your repository → backend folder"
    echo "5. Set environment variable: CORS_ORIGIN=https://your-site.netlify.app"
    echo ""
    echo "Frontend (Netlify):"
    echo "1. Go to https://netlify.com"
    echo "2. 'New site from Git' → Select your repo"
    echo "3. Build command: cd frontend && npm run build"
    echo "4. Publish directory: frontend/dist"
    echo "5. Set environment variable: VITE_API_URL=https://your-backend.railway.app"
    echo ""
    print_status "💰 Cost: Free for small projects!"
}

docker_deployment() {
    print_status "🐳 Docker Deployment"
    echo ""
    echo "Backend Docker commands:"
    echo "cd backend"
    echo "docker build -t youtube-downloader-backend ."
    echo "docker run -d -p 3001:3001 --name yt-backend youtube-downloader-backend"
    echo ""
    echo "Frontend (serve dist folder with nginx or any static server)"
    echo ""
    print_status "Docker Compose available in docker-compose.yml"
}

deploy_vercel_railway() {
    print_status "⚡ Vercel + Railway Deployment"
    echo ""
    echo "Frontend (Vercel):"
    echo "1. Install Vercel CLI: npm i -g vercel"
    echo "2. cd frontend && vercel"
    echo "3. Follow prompts"
    echo "4. Set VITE_API_URL in Vercel dashboard"
    echo ""
    echo "Backend (Railway):"
    echo "Follow the Railway steps from option 2"
}

show_checklist() {
    print_status "📋 Deployment Checklist"
    echo ""
    echo "✅ Pre-deployment:"
    echo "   □ Code is committed to git"
    echo "   □ Frontend builds successfully"
    echo "   □ Backend dependencies installed"
    echo "   □ Environment variables configured"
    echo "   □ Domain names ready (optional)"
    echo ""
    echo "✅ During deployment:"
    echo "   □ Backend deployed and accessible"
    echo "   □ Frontend deployed and accessible"
    echo "   □ CORS configured correctly"
    echo "   □ Environment variables set in platforms"
    echo ""
    echo "✅ Post-deployment:"
    echo "   □ Test video info functionality"
    echo "   □ Test download functionality"
    echo "   □ Check console for errors"
    echo "   □ Test on mobile devices"
}

show_next_steps() {
    echo ""
    print_status "🎯 Next Steps:"
    echo "1. Choose a deployment platform from the menu below"
    echo "2. Follow the platform-specific instructions"
    echo "3. Update environment variables with your domains"
    echo "4. Test your live application"
    echo ""
}

# Main execution
main() {
    check_git
    check_npm
    
    # Check if we're in the right directory
    if [[ ! -d "frontend" || ! -d "backend" ]]; then
        print_error "Please run this script from the project root directory"
        exit 1
    fi
    
    deploy_menu
}

# Run main function
main