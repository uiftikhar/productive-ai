/**
 * Test Utilities for Integration Testing
 * 
 * This module provides utilities for integration testing the agentic meeting analysis system
 * following best practices:
 * 
 * 1. Using real service implementations where possible
 * 2. Mocking only external dependencies (LLMs, databases, etc.)
 * 3. Providing clear patterns for test setup
 * 
 * The approach emphasizes testing actual service interactions while maintaining
 * reproducibility and predictability by controlling external dependencies.
 */

// Export all mocks
export * from './mocks';

// Export test environment setup
export * from './setup-test-environment';

// Export test data factories
export * from './test-data-factories'; 