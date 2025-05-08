/**
 * Human-in-the-Loop Integration Module
 * Part of Milestone 2.3: Human-in-the-Loop Integration
 */

// Export interfaces
export * from './interfaces/approval.interface';
export * from './interfaces/feedback.interface';
export * from './interfaces/interruption.interface';
export * from './interfaces/ui.interface';

// Export implementations
export * from './approval/approval-workflow';
export * from './feedback/feedback-collector';
export * from './interruption/interruption-handler';
export * from './ui/notification-service';
export * from './ui/interaction-service';

// Export the integration module
export * from './integration/langgraph-human-loop-integration';

// Export the default implementation
import { HumanLoopIntegration } from './integration/langgraph-human-loop-integration';
export default HumanLoopIntegration; 