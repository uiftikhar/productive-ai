/**
 * Utility script to clean up malformed session files
 */
const fs = require('fs');
const path = require('path');

// Storage directory
const STORAGE_DIR = path.join(__dirname, 'data', 'file-storage');

// Get session files
const getSessionFiles = () => {
  try {
    const files = fs.readdirSync(STORAGE_DIR);
    return files.filter(file => file.includes('session') && file.endsWith('.json'));
  } catch (error) {
    console.error('Error reading storage directory:', error);
    return [];
  }
};

// Fix the session file to ensure it's valid JSON
const fixSessionFile = (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Try to find where the JSON ends
    const lastBrace = content.lastIndexOf('}');
    
    if (lastBrace === -1) {
      console.log(`No JSON object found in ${filePath}`);
      return false;
    }
    
    // Extract what should be valid JSON
    const validJson = content.substring(0, lastBrace + 1);
    
    // Check if anything was trimmed
    if (validJson.length < content.length) {
      console.log(`Fixing file ${filePath}: trimmed ${content.length - validJson.length} bytes`);
      
      // Verify the JSON is valid by parsing it
      try {
        JSON.parse(validJson);
        
        // Write the fixed JSON back to the file
        fs.writeFileSync(filePath, validJson);
        return true;
      } catch (jsonError) {
        console.error(`Error parsing JSON after fix in ${filePath}:`, jsonError);
        return false;
      }
    } else {
      console.log(`File ${filePath} appears to be valid JSON`);
      return false;
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return false;
  }
};

// Main function
const main = () => {
  console.log('Scanning for session files in', STORAGE_DIR);
  const sessionFiles = getSessionFiles();
  console.log(`Found ${sessionFiles.length} session files`);
  
  let fixedCount = 0;
  
  // Process each file
  for (const file of sessionFiles) {
    const filePath = path.join(STORAGE_DIR, file);
    const fixed = fixSessionFile(filePath);
    if (fixed) fixedCount++;
  }
  
  console.log(`Fixed ${fixedCount} of ${sessionFiles.length} session files`);
};

// Run the script
main(); 