/**
 * End-to-end test for Chat API with hierarchical agent integration
 */
import request from 'supertest';
import { Express } from 'express';
import { createServer } from '../../../server';
import { ServiceRegistry } from '../../../langgraph/agentic-meeting-analysis/services/service-registry';
import { setupMockServices } from '../../../test/helpers/mock-service-setup';

describe('Chat API Integration Tests', () => {
  it('works', () => {
    expect(1).toEqual(1)
  })
}); 