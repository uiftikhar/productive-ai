import { Request, Response } from 'express';
import { ServiceRegistry } from '../../langgraph/agentic-meeting-analysis/services/service-registry';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { getRequestId } from '../../shared/api/request-id';
import { sendSuccess, sendError } from '../../shared/api/response';
import { ApiErrorException, ErrorType, HttpStatus } from '../../shared/api/types';

const logger = new ConsoleLogger();

/**
 * Controller for debug endpoints
 */
export const debugController = {
  /**
   * Get agent system status
   * Returns the current status of the agent system
   */
  async getAgentStatus(req: Request, res: Response) {
    try {
      const serviceRegistry = ServiceRegistry.getInstance();
      const agentStatus = serviceRegistry.getAgentStatusReport();

      sendSuccess(res, agentStatus, HttpStatus.OK, { requestId: getRequestId(req) });
    } catch (error) {
      logger.error('Error getting agent status:', { error });
      sendError(res, error);
    }
  },

  /**
   * Get agent progress for a specific session
   * Returns the progress of a specific agent session
   */
  async getAgentProgress(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        throw new ApiErrorException(
          'Session ID is required',
          ErrorType.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          'ERR_MISSING_SESSION_ID'
        );
      }

      const serviceRegistry = ServiceRegistry.getInstance();
      const progress = await serviceRegistry.getSessionProgress(sessionId);

      sendSuccess(res, progress, HttpStatus.OK, { requestId: getRequestId(req) });
    } catch (error) {
      logger.error('Error getting agent progress:', { error });
      sendError(res, error);
    }
  },

  /**
   * Get agent communications
   * Returns the message history between agents for a specific session
   */
  async getAgentCommunications(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        throw new ApiErrorException(
          'Session ID is required',
          ErrorType.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          'ERR_MISSING_SESSION_ID'
        );
      }

      const serviceRegistry = ServiceRegistry.getInstance();
      const messageStore = serviceRegistry.getMessageStore();

      // Using getMessagesForSession which returns an array of ChatMessage
      const messages = await messageStore.getMessagesForSession(sessionId);

      // Prepare a sanitized response (to avoid exposing internal details)
      const communications = messages.map(msg => ({
        id: msg.id,
        timestamp: msg.timestamp,
        sender: msg.role,
        recipients: msg.metadata?.recipients || [],
        type: msg.metadata?.type || 'message',
        // Don't include internal system messages or sensitive content
        content: msg.content.length > 1000
          ? `${msg.content.substring(0, 1000)}... (truncated)`
          : msg.content
      }));

      sendSuccess(res, { sessionId, communications }, HttpStatus.OK, { requestId: getRequestId(req) });
    } catch (error) {
      logger.error('Error getting agent communications:', { error });
      sendError(res, error);
    }
  }
}; 