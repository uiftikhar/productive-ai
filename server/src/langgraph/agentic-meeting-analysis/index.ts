/**
 * Agentic Meeting Analysis System
 * 
 * A goal-oriented, collaborative agent system for analyzing meeting transcripts
 */

// Import services
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { BaseMeetingAnalysisAgent } from './agents/base-meeting-analysis-agent';
import { SharedMemoryService } from './memory/shared-memory.service';
import { StateRepositoryService } from './state/state-repository.service';
import { CommunicationService } from './communication/communication.service';
import { ApiCompatibilityService } from './api-compatibility/api-compatibility.service';

// Export all interfaces
export * from './interfaces';

// Export core services
export { BaseMeetingAnalysisAgent } from './agents/base-meeting-analysis-agent';
export { SharedMemoryService } from './memory/shared-memory.service';
export { StateRepositoryService } from './state/state-repository.service';
export { CommunicationService } from './communication/communication.service';
export { ApiCompatibilityService } from './api-compatibility/api-compatibility.service';

// Version information
export const VERSION = '1.0.0';
export const MILESTONE = 'Milestone 5: Meeting Analysis Reimplementation';

/**
 * Initialize the core services for the agentic meeting analysis system
 */
export async function initializeAgenticMeetingAnalysisSystem(options: {
  logger?: any;
  persistenceEnabled?: boolean;
  defaultFeatureFlag?: boolean;
} = {}) {
  const logger = options.logger || new ConsoleLogger();
  
  // Initialize core services
  const memory = new SharedMemoryService({
    logger,
    persistenceEnabled: options.persistenceEnabled
  });
  
  const state = new StateRepositoryService({
    logger,
    persistenceEnabled: options.persistenceEnabled
  });
  
  const communication = new CommunicationService({
    logger
  });
  
  const compatibility = new ApiCompatibilityService({
    logger,
    defaultFeatureFlag: options.defaultFeatureFlag
  });
  
  // Initialize all services
  await memory.initialize();
  await state.initialize();
  await communication.initialize();
  
  logger.info(`Agentic Meeting Analysis System v${VERSION} initialized`);
  
  // Return all initialized services
  return {
    memory,
    state,
    communication,
    compatibility,
    logger
  };
} 