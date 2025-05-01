/**
 * Progressive Deployment Script for Team Formation System
 *
 * This script implements a phased rollout of the team formation system:
 * 1. Deploy enhanced capability discovery while maintaining compatibility
 * 2. Introduce facilitator model alongside controller model
 * 3. Phase out static role assignments as dynamic roles mature
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const DEPLOYMENT_CONFIG = {
  phases: [
    {
      name: 'capability-discovery',
      description: 'Enhanced capability discovery with backward compatibility',
      components: [
        'capability-registry.service.ts',
        'capability-advertisement.service.ts',
        'capability-negotiation.service.ts',
        'capability-discovery.interface.ts',
      ],
      tests: ['test-capability-discovery.js'],
      compatibilityLayer: true,
    },
    {
      name: 'recruitment-protocol',
      description: 'Team formation protocols and contract management',
      components: [
        'recruitment-protocol.interface.ts',
        'agent-recruitment.service.ts',
        'team-contract.service.ts',
        'negotiation-engine.service.ts',
      ],
      tests: ['team-formation.integration.test.ts'],
      compatibilityLayer: true,
    },
    {
      name: 'emergent-roles',
      description: 'Dynamic role emergence and adaptive optimization',
      components: [
        'emergent-roles.interface.ts',
        'role-emergence.service.ts',
        'adaptive-team-optimization.service.ts',
      ],
      tests: ['test-team-formation.js'],
      compatibilityLayer: true,
    },
    {
      name: 'legacy-removal',
      description: 'Remove deprecated components and compatibility layers',
      deprecatedComponents: [
        'team-optimization.service.ts',
        'temp-visualization.service.ts',
        'supervisor-agent.ts',
        'facilitator-agent.ts',
        '_facilitator-supervisor-agent.ts',
        'recruitment-protocol.service.ts',
      ],
      compatibilityLayer: false,
    },
  ],
  srcPath: path.join(__dirname, '..', 'src'),
  distPath: path.join(__dirname, '..', 'dist'),
  logsPath: path.join(__dirname, '..', 'logs', 'deployment'),
};

// Ensure logs directory exists
if (!fs.existsSync(DEPLOYMENT_CONFIG.logsPath)) {
  fs.mkdirSync(DEPLOYMENT_CONFIG.logsPath, { recursive: true });
}

/**
 * Logs a message with timestamp to console and log file
 */
function logMessage(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;

  console.log(logMessage);

  // Log to file
  const logFile = path.join(
    DEPLOYMENT_CONFIG.logsPath,
    `deployment-${new Date().toISOString().split('T')[0]}.log`,
  );

  fs.appendFileSync(logFile, logMessage + '\n');
}

/**
 * Verifies that all required components exist
 */
function verifyComponents(components, basePath) {
  logMessage('Verifying components...');

  const missingComponents = [];

  for (const component of components) {
    // First check in agents/services directory (most common location)
    const serviceComponentPath = path.join(
      basePath,
      'agents',
      'services',
      component,
    );
    const interfaceComponentPath = path.join(
      basePath,
      'agents',
      'interfaces',
      component,
    );

    if (
      !fs.existsSync(serviceComponentPath) &&
      !fs.existsSync(interfaceComponentPath)
    ) {
      missingComponents.push(component);
    }
  }

  if (missingComponents.length > 0) {
    logMessage(`Missing components: ${missingComponents.join(', ')}`, 'ERROR');
    throw new Error('Component verification failed');
  }

  logMessage('All components verified', 'SUCCESS');
  return true;
}

/**
 * Runs tests for a specific phase
 */
function runTests(tests) {
  logMessage('Running tests...');

  for (const test of tests) {
    try {
      logMessage(`Executing test: ${test}`);
      execSync(`node ${test}`, { stdio: 'inherit' });
      logMessage(`Test ${test} passed`, 'SUCCESS');
    } catch (error) {
      logMessage(`Test ${test} failed: ${error.message}`, 'ERROR');
      throw new Error('Test execution failed');
    }
  }

  logMessage('All tests passed', 'SUCCESS');
  return true;
}

/**
 * Creates compatibility layer for backward compatibility
 */
function createCompatibilityLayer(phase) {
  logMessage(`Creating compatibility layer for ${phase.name}...`);

  // Create compatibility directory if it doesn't exist
  const compatibilityDir = path.join(
    DEPLOYMENT_CONFIG.srcPath,
    'compatibility',
  );
  if (!fs.existsSync(compatibilityDir)) {
    fs.mkdirSync(compatibilityDir, { recursive: true });
  }

  // For each component in the phase, create a compatibility wrapper
  for (const component of phase.components) {
    const baseName = component.replace('.ts', '');
    const compatFile = path.join(compatibilityDir, `${baseName}.compat.ts`);

    // Only create compatibility file if it doesn't exist
    if (!fs.existsSync(compatFile)) {
      logMessage(`Creating compatibility layer for ${component}`);

      // Create simple compatibility wrapper
      const content = `/**
 * Compatibility layer for ${component}
 * 
 * This file provides backward compatibility for legacy integrations
 * while new components are being phased in.
 */

// Import both old and new implementations
import { ${toCamelCase(baseName)} as Legacy${toCamelCase(baseName)} } from '../agents/legacy/${baseName}';
import { ${toCamelCase(baseName)} as New${toCamelCase(baseName)} } from '../agents/services/${baseName}';

// Re-export with compatibility mapping
export class ${toCamelCase(baseName)}Compat {
  private legacyImpl: Legacy${toCamelCase(baseName)};
  private newImpl: New${toCamelCase(baseName)};
  private useNewImpl: boolean;
  
  constructor(options: any = {}) {
    this.legacyImpl = new Legacy${toCamelCase(baseName)}(options);
    this.newImpl = new New${toCamelCase(baseName)}(options);
    this.useNewImpl = options.useNewImpl !== false; // Default to new implementation
  }
  
  // Wrap methods with compatibility logic
  // Add specific methods as needed for each service
}
`;

      fs.writeFileSync(compatFile, content);
    }
  }

  logMessage('Compatibility layer created', 'SUCCESS');
  return true;
}

/**
 * Deploys a phase of the system
 */
async function deployPhase(phase, phaseIndex) {
  logMessage(`Starting deployment of phase ${phaseIndex + 1}: ${phase.name}`);
  logMessage(`Description: ${phase.description}`);

  try {
    // Special handling for the legacy removal phase
    if (phase.name === 'legacy-removal') {
      await removeDeprecatedComponents(phase.deprecatedComponents);
      return true;
    }

    // Verify components exist
    verifyComponents(phase.components, DEPLOYMENT_CONFIG.srcPath);

    // Create compatibility layer if needed
    if (phase.compatibilityLayer) {
      createCompatibilityLayer(phase);
    }

    // Build the distribution
    logMessage('Building distribution...');
    execSync('npm run build', { stdio: 'inherit' });

    // Run tests
    if (phase.tests && phase.tests.length > 0) {
      runTests(phase.tests);
    }

    logMessage(
      `Phase ${phaseIndex + 1}: ${phase.name} deployed successfully`,
      'SUCCESS',
    );
    return true;
  } catch (error) {
    logMessage(
      `Failed to deploy phase ${phaseIndex + 1}: ${phase.name}`,
      'ERROR',
    );
    logMessage(error.message, 'ERROR');
    return false;
  }
}

/**
 * Removes deprecated components
 */
async function removeDeprecatedComponents(components) {
  logMessage('Removing deprecated components...');

  for (const component of components) {
    // Check different possible locations
    const paths = [
      path.join(DEPLOYMENT_CONFIG.srcPath, 'agents', 'services', component),
      path.join(DEPLOYMENT_CONFIG.srcPath, 'agents', 'specialized', component),
      path.join(DEPLOYMENT_CONFIG.srcPath, 'agents', 'interfaces', component),
    ];

    for (const componentPath of paths) {
      if (fs.existsSync(componentPath)) {
        logMessage(`Removing: ${componentPath}`);
        fs.unlinkSync(componentPath);
      }
    }
  }

  // Also remove compatibility directory
  const compatibilityDir = path.join(
    DEPLOYMENT_CONFIG.srcPath,
    'compatibility',
  );
  if (fs.existsSync(compatibilityDir)) {
    logMessage('Removing compatibility layer...');
    fs.rmdirSync(compatibilityDir, { recursive: true });
  }

  logMessage('Deprecated components removed', 'SUCCESS');
  return true;
}

/**
 * Helper for converting file names to camel case for class names
 */
function toCamelCase(str) {
  return str
    .split('-')
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('')
    .split('.')
    .map((part, index) =>
      index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part,
    )
    .join('');
}

/**
 * Main deployment function
 */
async function deploy() {
  logMessage('Starting progressive deployment of Team Formation System');

  let successfulPhases = 0;

  for (let i = 0; i < DEPLOYMENT_CONFIG.phases.length; i++) {
    const phase = DEPLOYMENT_CONFIG.phases[i];
    const success = await deployPhase(phase, i);

    if (success) {
      successfulPhases++;

      // Add a delay between phases to allow for monitoring
      if (i < DEPLOYMENT_CONFIG.phases.length - 1) {
        logMessage(`Waiting before deploying next phase...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } else {
      logMessage(`Deployment halted at phase ${i + 1}`, 'WARNING');
      break;
    }
  }

  if (successfulPhases === DEPLOYMENT_CONFIG.phases.length) {
    logMessage('Progressive deployment completed successfully', 'SUCCESS');
  } else {
    logMessage(
      `Progressive deployment completed with ${DEPLOYMENT_CONFIG.phases.length - successfulPhases} failed phases`,
      'WARNING',
    );
  }
}

// Run the deployment
if (require.main === module) {
  deploy().catch((error) => {
    logMessage(`Deployment failed: ${error.message}`, 'ERROR');
    process.exit(1);
  });
}

module.exports = {
  deploy,
  deployPhase,
  DEPLOYMENT_CONFIG,
};
