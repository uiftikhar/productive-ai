#!/usr/bin/env ts-node
/**
 * Agent Migration Script
 *
 * This script helps migrate legacy agent implementations to the new BaseAgent pattern.
 * It analyzes an existing agent file and suggests changes to make it compatible with
 * the BaseAgentInterface.
 *
 * Usage:
 *   ts-node migrate-agent.ts <agent-file-path>
 *
 * Example:
 *   ts-node migrate-agent.ts src/agents/specialized/knowledge-retrieval-agent.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

// Define the main interface properties that we need to check for
const REQUIRED_PROPERTIES = [
  'id',
  'name',
  'description',
  'getCapabilities',
  'canHandle',
  'initialize',
  'execute',
  'getState',
  'getInitializationStatus',
  'terminate',
  'getMetrics',
];

// Define a template for the BaseAgent extension
const BASE_AGENT_TEMPLATE = `import { BaseAgent } from '../base/base-agent';
import { AgentCapability, AgentRequest, AgentResponse } from '../interfaces/base-agent.interface';
import { Logger } from '../../shared/logger/logger.interface';

export class NewAgent extends BaseAgent {
  constructor(
    options: {
      logger?: Logger;
      // Add any other dependencies here
    } = {}
  ) {
    super(
      'New Agent', // Name
      'Description of the new agent', // Description
      {
        logger: options.logger,
        // Pass other options to the base class
      }
    );
    
    // Register agent capabilities
    this.registerCapability({
      name: 'capability-name',
      description: 'Description of the capability',
    });
  }

  /**
   * Agent-specific initialization logic
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    // Call base initialization first
    await super.initialize(config);
    
    // Add agent-specific initialization here
  }

  /**
   * Agent-specific execution logic
   */
  protected async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    // Implement the agent-specific execution logic
    return {
      output: 'Response from the agent',
    };
  }
}`;

/**
 * Check if a file exists
 */
function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Analyze a TypeScript file to detect agent properties
 */
function analyzeAgentFile(filePath: string): {
  className: string;
  implementsInterface: boolean;
  existingProperties: string[];
  missingProperties: string[];
} {
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  const sourceFile = ts.createSourceFile(
    path.basename(filePath),
    fileContent,
    ts.ScriptTarget.Latest,
    true,
  );

  let className = '';
  let implementsInterface = false;
  const existingProperties: string[] = [];

  // Helper function to visit nodes
  function visit(node: ts.Node) {
    // Check for class declarations
    if (ts.isClassDeclaration(node) && node.name) {
      className = node.name.text;

      // Check if class implements an interface
      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
            for (const type of clause.types) {
              const interfaceName = type.expression.getText(sourceFile);
              if (
                interfaceName.includes('AgentInterface') ||
                interfaceName.includes('UnifiedAgentInterface')
              ) {
                implementsInterface = true;
              }
            }
          }
        }
      }

      // Check for properties and methods
      node.members.forEach((member) => {
        if (
          ts.isPropertyDeclaration(member) ||
          ts.isMethodDeclaration(member)
        ) {
          if (member.name && ts.isIdentifier(member.name)) {
            existingProperties.push(member.name.text);
          }
        }
      });
    }

    // Continue visiting child nodes
    ts.forEachChild(node, visit);
  }

  // Start visiting nodes
  visit(sourceFile);

  // Determine missing properties
  const missingProperties = REQUIRED_PROPERTIES.filter(
    (prop) => !existingProperties.includes(prop),
  );

  return {
    className,
    implementsInterface,
    existingProperties,
    missingProperties,
  };
}

/**
 * Generate migration suggestions
 */
function generateMigrationSuggestions(analysis: {
  className: string;
  implementsInterface: boolean;
  existingProperties: string[];
  missingProperties: string[];
}): string {
  let suggestions = `Migration Analysis for ${analysis.className}\n`;
  suggestions += `${'='.repeat(50)}\n\n`;

  if (analysis.implementsInterface) {
    suggestions += `✓ Class already implements an AgentInterface\n`;
  } else {
    suggestions += `⚠ Class does not implement BaseAgentInterface\n`;
    suggestions += `  Add 'implements BaseAgentInterface' to the class declaration\n\n`;
  }

  if (analysis.missingProperties.length === 0) {
    suggestions += `✓ Class implements all required properties and methods\n`;
  } else {
    suggestions += `⚠ Missing required properties/methods:\n`;
    for (const prop of analysis.missingProperties) {
      suggestions += `  - ${prop}\n`;
    }
  }

  suggestions += `\nMigration Recommendations:\n`;
  suggestions += `${'-'.repeat(50)}\n\n`;

  if (analysis.missingProperties.length > 3) {
    suggestions += `Consider extending BaseAgent instead of implementing the interface directly:\n\n`;
    suggestions += `1. Change your class to extend BaseAgent\n`;
    suggestions += `2. Update the constructor to call super() with name, description, and options\n`;
    suggestions += `3. Implement only the executeInternal() method\n`;
    suggestions += `4. Register capabilities using this.registerCapability()\n\n`;

    suggestions += `Example Template:\n\n`;
    suggestions += `\`\`\`typescript\n${BASE_AGENT_TEMPLATE}\n\`\`\`\n`;
  } else {
    suggestions += `Implement the missing methods to conform to BaseAgentInterface:\n\n`;
    for (const prop of analysis.missingProperties) {
      if (prop === 'id' || prop === 'name' || prop === 'description') {
        suggestions += `Add readonly property '${prop}'\n`;
      } else {
        suggestions += `Implement method '${prop}()'\n`;
      }
    }
  }

  return suggestions;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.error('Usage: ts-node migrate-agent.ts <agent-file-path>');
    process.exit(1);
  }

  const filePath = args[0];

  if (!fileExists(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    const analysis = analyzeAgentFile(filePath);
    const suggestions = generateMigrationSuggestions(analysis);

    console.log(suggestions);
  } catch (error) {
    console.error('Error analyzing file:', error);
    process.exit(1);
  }
}

// Run the script
main();
