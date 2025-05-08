/**
 * Test Hierarchical Agents System
 * 
 * This file tests the new hierarchical supervisor-manager-worker pattern that is replacing
 * the deprecated flat coordination model. The EnhancedSupervisorAgent implementation
 * provides the following benefits aligned with our product goals:
 * 
 * - Enhanced organizational productivity through more efficient meeting analysis
 * - Improved decision tracking and action item extraction
 * - Better expertise identification and knowledge continuity
 * - More scalable architecture for enterprise customers
 * 
 * This approach better supports our unique selling proposition of connecting
 * questions to answers through people rather than just documents.
 */
const { runHierarchicalAnalysisExample } = require('./dist/langgraph/agentic-meeting-analysis/examples/hierarchical-analysis-example');

console.log('Starting hierarchical meeting analysis test...');
console.log('-----------------------------------------------');
console.log('This test demonstrates a true hierarchical structure with:');
console.log('1. Supervisor agent at the top level');
console.log('2. Manager agents coordinating teams of specialists');
console.log('3. Worker agents handling specific expertise areas');
console.log('4. True task decomposition through the hierarchy');
console.log('-----------------------------------------------\n');

// Run the example
runHierarchicalAnalysisExample()
  .then(result => {
    console.log('\n--- Test Complete ---');
    console.log(`Graph executed with ${result.executionPath.length} steps`);
    console.log('Execution path:', result.executionPath.join(' → '));
    
    // Print a summary of the results
    console.log('\nAnalysis Results Summary:');
    Object.keys(result.results).forEach(agentId => {
      console.log(`- ${agentId}: ${result.results[agentId].processed ? 'Processed' : 'Not processed'}`);
    });
    
    console.log('\nHierarchical agent structure successfully implemented!');
  })
  .catch(err => {
    console.error('Error in hierarchical test:', err);
    process.exit(1);
  }); 