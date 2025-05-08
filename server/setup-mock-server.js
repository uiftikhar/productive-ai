/**
 * Setup script for MSW mock server
 * 
 * Checks if required dependencies are installed and provides instructions
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Check if MSW is installed
function checkDependencies() {
  try {
    require.resolve('msw');
    require.resolve('msw/node');
    console.log('✅ MSW dependencies are already installed');
    return true;
  } catch (error) {
    console.log('⚠️ MSW dependencies are not installed');
    return false;
  }
}

// Install necessary dependencies
function installDependencies() {
  console.log('Installing MSW dependencies...');
  try {
    execSync('npm install --save-dev msw@^2.0.0', { stdio: 'inherit' });
    console.log('✅ MSW dependencies installed successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to install MSW dependencies:', error.message);
    return false;
  }
}

// Create mocks directory if it doesn't exist
function createMocksDir() {
  const mocksDir = path.join(__dirname, 'mocks');
  if (!fs.existsSync(mocksDir)) {
    fs.mkdirSync(mocksDir);
    console.log('✅ Created mocks directory');
  } else {
    console.log('✅ Mocks directory already exists');
  }
}

// Run setup
function runSetup() {
  console.log('Setting up MSW mock server...');
  if (!checkDependencies()) {
    if (!installDependencies()) {
      console.log('\nPlease run the following command manually:');
      console.log('  npm install --save-dev msw@^2.0.0');
      console.log('  # or');
      console.log('  yarn add --dev msw@^2.0.0');
      process.exit(1);
    }
  }
  
  createMocksDir();
  
  console.log('\nSetup complete! You can now run the test:');
  console.log('  npm run test:chat');
  console.log('  # or');
  console.log('  yarn test:chat');
}

runSetup(); 