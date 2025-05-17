/**
 * Script to fix common environment configuration issues
 */
const fs = require('fs');
const path = require('path');

// Path to .env file
const envFilePath = path.join(__dirname, '.env');

// Main function
async function fixEnvConfig() {
  console.log('Checking environment configuration...');
  
  try {
    // Read current .env file
    let envContent = '';
    
    if (fs.existsSync(envFilePath)) {
      envContent = fs.readFileSync(envFilePath, 'utf8');
      console.log('Found existing .env file');
    } else {
      console.log('No .env file found, creating a new one');
    }
    
    // Parse .env content
    const envVars = parseEnvFile(envContent);
    let modified = false;
    
    // Fix OPENAI_API_KEY: remove newlines and extra spaces
    if (envVars.OPENAI_API_KEY) {
      const originalKey = envVars.OPENAI_API_KEY;
      const cleanedKey = originalKey.replace(/\s+/g, '');
      
      if (cleanedKey !== originalKey) {
        console.log('Fixing malformed OPENAI_API_KEY (removed whitespace)');
        envVars.OPENAI_API_KEY = cleanedKey;
        modified = true;
      } else {
        console.log('OPENAI_API_KEY looks good');
      }
    } else {
      console.log('WARNING: No OPENAI_API_KEY found in .env file!');
    }
    
    // Ensure USE_MOCK_IMPLEMENTATIONS is set to false
    if (envVars.USE_MOCK_IMPLEMENTATIONS === undefined) {
      console.log('Adding USE_MOCK_IMPLEMENTATIONS=false');
      envVars.USE_MOCK_IMPLEMENTATIONS = 'false';
      modified = true;
    } else if (envVars.USE_MOCK_IMPLEMENTATIONS !== 'false') {
      console.log(`Changing USE_MOCK_IMPLEMENTATIONS from '${envVars.USE_MOCK_IMPLEMENTATIONS}' to 'false'`);
      envVars.USE_MOCK_IMPLEMENTATIONS = 'false';
      modified = true;
    } else {
      console.log('USE_MOCK_IMPLEMENTATIONS is already set to false');
    }

    // Update DEFAULT_MODEL if needed
    if (!envVars.DEFAULT_MODEL) {
      console.log('Setting DEFAULT_MODEL=gpt-4o');
      envVars.DEFAULT_MODEL = 'gpt-4o';
      modified = true;
    }
    
    // Write back to .env file if modified
    if (modified) {
      const newEnvContent = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      
      // Create backup of original file
      if (fs.existsSync(envFilePath)) {
        const backupPath = `${envFilePath}.backup-${Date.now()}`;
        fs.copyFileSync(envFilePath, backupPath);
        console.log(`Backup created at ${backupPath}`);
      }
      
      // Write updated content
      fs.writeFileSync(envFilePath, newEnvContent);
      console.log('Environment configuration updated successfully!');
    } else {
      console.log('No changes needed to environment configuration.');
    }
    
    return true;
  } catch (error) {
    console.error('Error fixing environment configuration:', error);
    return false;
  }
}

// Parse .env file content into an object
function parseEnvFile(content) {
  const result = {};
  
  if (!content) return result;
  
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || !line.trim()) continue;
    
    // Find the first equals sign (handle values that contain =)
    const equalsPos = line.indexOf('=');
    if (equalsPos > 0) {
      const key = line.substring(0, equalsPos).trim();
      const value = line.substring(equalsPos + 1).trim();
      
      // Remove quotes if present
      result[key] = value.replace(/^["'](.*)["']$/, '$1');
    }
  }
  
  return result;
}

// Run the script
fixEnvConfig()
  .then(success => {
    console.log(success ? 'Done!' : 'Failed to fix environment configuration.');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  }); 