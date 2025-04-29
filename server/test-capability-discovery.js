/**
 * Test Capability Discovery and Negotiation
 * 
 * This script demonstrates the enhanced agent discovery and capability matching
 * features implemented for Milestone 1.
 */

const { CapabilityRegistryService } = require('./dist/agents/services/capability-registry.service');
const { CapabilityNegotiationService } = require('./dist/agents/services/capability-negotiation.service');
const { CapabilityTaxonomy, CapabilityLevel } = require('./dist/agents/interfaces/capability-discovery.interface');

async function runTest() {
  console.log('=== Testing Enhanced Capability Discovery and Negotiation ===\n');
  
  // Initialize services
  const registry = CapabilityRegistryService.getInstance();
  const negotiation = CapabilityNegotiationService.getInstance({ registry });
  
  // 1. Register some sample capabilities
  console.log('1. Registering sample capabilities and providers...');
  
  // Register research agent capabilities
  registry.registerCapability({
    name: 'web_research',
    description: 'Ability to search and gather information from the web',
    level: CapabilityLevel.ADVANCED,
    taxonomy: [CapabilityTaxonomy.RESEARCH, CapabilityTaxonomy.PERCEPTION],
    compatibilities: [
      {
        type: 'complementary',
        targetCapability: 'information_synthesis',
        strength: 0.9,
        description: 'Web research provides raw data for information synthesis'
      },
      {
        type: 'prerequisite',
        targetCapability: 'domain_expertise',
        strength: 0.7,
        description: 'Domain expertise helps guide effective web research'
      }
    ]
  }, 'research-agent-1');
  
  registry.registerCapability({
    name: 'information_synthesis',
    description: 'Ability to combine and analyze information from multiple sources',
    level: CapabilityLevel.STANDARD,
    taxonomy: [CapabilityTaxonomy.REASONING, CapabilityTaxonomy.SUMMARIZATION],
    compatibilities: [
      {
        type: 'complementary',
        targetCapability: 'content_creation',
        strength: 0.8,
        description: 'Information synthesis provides refined inputs for content creation'
      }
    ]
  }, 'analysis-agent-1');
  
  // Register content creation agent capabilities
  registry.registerCapability({
    name: 'content_creation',
    description: 'Ability to create high-quality written content',
    level: CapabilityLevel.EXPERT,
    taxonomy: [CapabilityTaxonomy.CONTENT_CREATION, CapabilityTaxonomy.GENERATION],
    compatibilities: [
      {
        type: 'complementary',
        targetCapability: 'creative_ideation',
        strength: 0.7,
        description: 'Creative ideation enhances content creation with novel ideas'
      }
    ]
  }, 'writer-agent-1');
  
  registry.registerCapability({
    name: 'creative_ideation',
    description: 'Ability to generate creative ideas and concepts',
    level: CapabilityLevel.ADVANCED,
    taxonomy: [CapabilityTaxonomy.GENERATION, CapabilityTaxonomy.META_COGNITION],
  }, 'creative-agent-1');
  
  // Register coding agent capabilities
  registry.registerCapability({
    name: 'code_generation',
    description: 'Ability to generate code in various programming languages',
    level: CapabilityLevel.EXPERT,
    taxonomy: [CapabilityTaxonomy.CODE, CapabilityTaxonomy.GENERATION],
    compatibilities: [
      {
        type: 'complementary',
        targetCapability: 'code_review',
        strength: 0.9,
        description: 'Code generation is complemented by code review for quality assurance'
      }
    ]
  }, 'coder-agent-1');
  
  registry.registerCapability({
    name: 'code_review',
    description: 'Ability to review and improve existing code',
    level: CapabilityLevel.ADVANCED,
    taxonomy: [CapabilityTaxonomy.CODE, CapabilityTaxonomy.REASONING],
  }, 'reviewer-agent-1');
  
  // Additional agents with some overlapping capabilities
  registry.registerCapability({
    name: 'web_research',
    description: 'Ability to search and gather information from the web',
    level: CapabilityLevel.STANDARD,
    taxonomy: [CapabilityTaxonomy.RESEARCH],
  }, 'research-agent-2');
  
  registry.registerCapability({
    name: 'content_creation',
    description: 'Ability to create content in various formats',
    level: CapabilityLevel.STANDARD,
    taxonomy: [CapabilityTaxonomy.CONTENT_CREATION],
  }, 'content-agent-2');
  
  console.log('Registered capabilities for 7 agents with various complementary relationships\n');
  
  // 2. Test similarity detection
  console.log('2. Testing capability similarity detection...');
  
  const similarToResearch = registry.getSimilarCapabilities('web_research');
  console.log('Capabilities similar to web_research:');
  similarToResearch.forEach(({ name, score }) => {
    console.log(`  - ${name} (similarity score: ${score.toFixed(2)})`);
  });
  
  const similarToContentCreation = registry.getSimilarCapabilities('content_creation');
  console.log('\nCapabilities similar to content_creation:');
  similarToContentCreation.forEach(({ name, score }) => {
    console.log(`  - ${name} (similarity score: ${score.toFixed(2)})`);
  });
  
  // 3. Test complementary capability detection
  console.log('\n3. Testing complementary capability detection...');
  
  const complementaryToResearch = registry.getComplementaryCapabilities(['web_research']);
  console.log('Capabilities complementary to web_research:', complementaryToResearch);
  
  const complementaryToCoding = registry.getComplementaryCapabilities(['code_generation']);
  console.log('Capabilities complementary to code_generation:', complementaryToCoding);
  
  // 4. Test composition scoring
  console.log('\n4. Testing capability combination scoring...');
  
  const researchWritingCombo = registry.scoreCapabilityCombination([
    'web_research', 'information_synthesis', 'content_creation'
  ]);
  
  console.log('Score for research + synthesis + writing combination:');
  console.log(`  - Composition score: ${researchWritingCombo.compositionScore.toFixed(2)}`);
  console.log(`  - Complementarity score: ${researchWritingCombo.complementarityScore.toFixed(2)}`);
  console.log(`  - Taxonomic coverage: ${researchWritingCombo.taxonomicCoverageScore.toFixed(2)}`);
  console.log(`  - Missing critical capabilities:`, researchWritingCombo.missingCriticalCapabilities);
  console.log(`  - Suggested additions:`, researchWritingCombo.suggestedAdditions);
  
  const codingCombo = registry.scoreCapabilityCombination([
    'code_generation', 'code_review'
  ]);
  
  console.log('\nScore for code generation + review combination:');
  console.log(`  - Composition score: ${codingCombo.compositionScore.toFixed(2)}`);
  console.log(`  - Complementarity score: ${codingCombo.complementarityScore.toFixed(2)}`);
  console.log(`  - Taxonomic coverage: ${codingCombo.taxonomicCoverageScore.toFixed(2)}`);
  console.log(`  - Missing critical capabilities:`, codingCombo.missingCriticalCapabilities);
  console.log(`  - Suggested additions:`, codingCombo.suggestedAdditions);
  
  // 5. Test provider discovery for multiple capabilities
  console.log('\n5. Testing provider discovery for multiple capabilities...');
  
  const researchTeam = registry.findProvidersForCapabilities({
    capabilities: ['web_research', 'information_synthesis', 'content_creation'],
    contextualTaxonomies: [CapabilityTaxonomy.RESEARCH, CapabilityTaxonomy.CONTENT_CREATION]
  });
  
  console.log('Providers for research team:');
  console.log(`  - Success: ${researchTeam.success}`);
  console.log(`  - Coverage score: ${researchTeam.coverageScore.toFixed(2)}`);
  console.log(`  - Providers:`);
  researchTeam.providers.forEach(({ providerId, capabilities, score }) => {
    console.log(`    - ${providerId} (score: ${score.toFixed(2)}, capabilities: ${capabilities.join(', ')})`);
  });
  
  // 6. Test negotiation protocol
  console.log('\n6. Testing capability negotiation protocol...');
  
  // Create an inquiry for web research capability
  const inquiry = negotiation.createCapabilityInquiry({
    fromAgentId: 'coordinator-agent',
    capability: 'web_research',
    context: { query: 'latest AI developments' },
    priority: 'high',
  });
  
  console.log(`Created capability inquiry ${inquiry.inquiryId} for web_research`);
  
  // Simulate responses from potential providers
  const response1 = negotiation.createInquiryResponse({
    inquiryId: inquiry.inquiryId,
    fromAgentId: 'research-agent-1',
    available: true,
    confidenceLevel: 0.9,
    estimatedCompletion: 5000,
    commitmentLevel: 'firm',
  });
  
  const response2 = negotiation.createInquiryResponse({
    inquiryId: inquiry.inquiryId,
    fromAgentId: 'research-agent-2',
    available: true,
    confidenceLevel: 0.7,
    estimatedCompletion: 8000,
    commitmentLevel: 'tentative',
  });
  
  negotiation.processInquiryResponse(response1);
  negotiation.processInquiryResponse(response2);
  
  // Get negotiation result
  const result = negotiation.getNegotiationResult(inquiry.inquiryId);
  
  console.log('\nNegotiation result:');
  console.log(`  - Success: ${result.success}`);
  console.log(`  - Available providers: ${result.availableProviders.join(', ')}`);
  console.log(`  - Selected provider: ${result.selectedProvider}`);
  console.log(`  - Message: ${result.message}`);
  
  console.log('\n=== Test completed successfully ===');
}

runTest().catch(error => {
  console.error('Test failed:', error);
}); 