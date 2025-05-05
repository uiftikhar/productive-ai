#!/bin/bash
# Production deployment script for the Agentic Meeting Analysis System

set -e  # Exit on any error

# Configuration
APP_NAME="productive-ai-meeting-analysis"
DEPLOY_ENV=${1:-production}
TIMESTAMP=$(date +%Y%m%d%H%M%S)
LOG_FILE="./logs/deploy-$TIMESTAMP.log"

# Make sure logs directory exists
mkdir -p ./logs

echo "Starting deployment of $APP_NAME to $DEPLOY_ENV environment at $(date)" | tee -a $LOG_FILE

# 1. Validate prerequisites
if [ ! -f ./package.json ]; then
  echo "Error: package.json not found. Make sure you're in the server directory" | tee -a $LOG_FILE
  exit 1
fi

if [ ! -d "./src/langgraph/agentic-meeting-analysis" ]; then
  echo "Error: Agentic Meeting Analysis system not found" | tee -a $LOG_FILE
  exit 1
fi

# 2. Check environment variables
if [ ! -f ./.env.$DEPLOY_ENV ]; then
  echo "Error: .env.$DEPLOY_ENV file not found. Please create it with the required environment variables" | tee -a $LOG_FILE
  exit 1
fi

# Copy environment file to .env
cp ./.env.$DEPLOY_ENV ./.env
echo "Environment configured for $DEPLOY_ENV" | tee -a $LOG_FILE

# 3. Install dependencies
echo "Installing dependencies..." | tee -a $LOG_FILE
npm ci

# 4. Run type checks and linting
echo "Running TypeScript checks..." | tee -a $LOG_FILE
npm run typecheck >> $LOG_FILE 2>&1 || { echo "TypeScript check failed. See $LOG_FILE for details"; exit 1; }

echo "Running linting..." | tee -a $LOG_FILE
npm run lint >> $LOG_FILE 2>&1 || { echo "Linting failed. See $LOG_FILE for details"; exit 1; }

# 5. Run tests for the agentic system
echo "Running agentic system tests..." | tee -a $LOG_FILE
npm run test:agentic >> $LOG_FILE 2>&1 || { echo "Tests failed. See $LOG_FILE for details"; exit 1; }

# 6. Build the project
echo "Building the project..." | tee -a $LOG_FILE
npm run build >> $LOG_FILE 2>&1 || { echo "Build failed. See $LOG_FILE for details"; exit 1; }

# 7. Database initialization/migrations if needed
if [ -f ./scripts/init-db.js ]; then
  echo "Initializing database..." | tee -a $LOG_FILE
  node ./scripts/init-db.js >> $LOG_FILE 2>&1 || { echo "Database initialization failed. See $LOG_FILE for details"; exit 1; }
fi

# 8. Create deployment package
DEPLOY_PACKAGE="deploy-$APP_NAME-$DEPLOY_ENV-$TIMESTAMP.tar.gz"
echo "Creating deployment package $DEPLOY_PACKAGE..." | tee -a $LOG_FILE

# Include only necessary files
tar -czf $DEPLOY_PACKAGE \
    --exclude="node_modules" \
    --exclude=".git" \
    --exclude="logs" \
    --exclude="*.tar.gz" \
    --exclude="coverage" \
    dist/ \
    package.json \
    package-lock.json \
    .env \
    README.md

echo "Deployment package created: $DEPLOY_PACKAGE" | tee -a $LOG_FILE

# 9. Deploy the package (adjust for your deployment method)
if [ "$DEPLOY_ENV" = "production" ]; then
  echo "Deploying to production..." | tee -a $LOG_FILE
  
  # Example: Copy to a deployment server
  # scp $DEPLOY_PACKAGE user@production-server:/deploy/
  
  # Example: Deploy to cloud service
  # aws s3 cp $DEPLOY_PACKAGE s3://deployments/$APP_NAME/
  # aws lambda update-function-code --function-name $APP_NAME --s3-bucket deployments --s3-key $APP_NAME/$DEPLOY_PACKAGE
  
  echo "Production deployment step would go here" | tee -a $LOG_FILE
  # Add your actual deployment commands here
elif [ "$DEPLOY_ENV" = "staging" ]; then
  echo "Deploying to staging..." | tee -a $LOG_FILE
  # Add staging deployment commands here
fi

# 10. Run smoke tests against the deployed service
echo "Running smoke tests against deployed service..." | tee -a $LOG_FILE
# Add commands to run basic tests against the deployed service

# 11. Clean up
echo "Cleaning up..." | tee -a $LOG_FILE
if [ "$DEPLOY_ENV" != "development" ]; then
  rm -f .env
fi

echo "Deployment completed successfully at $(date)" | tee -a $LOG_FILE
echo "===============================================" | tee -a $LOG_FILE
echo "Agentic Meeting Analysis System is now deployed to $DEPLOY_ENV"
echo "Logs available at $LOG_FILE" 