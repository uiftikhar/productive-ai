/**
 * Role Distribution Visualization Service
 * 
 * Implements visualization of agent role distribution for meeting analysis.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import { AgentExpertise } from '../../interfaces/agent.interface';
import { 
  RoleDistributionVisualization, 
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Visualization data structure
 */
interface DistributionData {
  id: string;
  meetingId: string;
  expertiseDistribution: Record<AgentExpertise, number>;
  specializations: Record<string, number>;
  elements: Map<string, VisualizationElement>;
  connections: Map<string, VisualizationConnection>;
  version: number;
  timestamp: Date;
}

/**
 * Configuration for the RoleDistributionVisualizationImpl
 */
export interface RoleDistributionVisualizationConfig {
  logger?: Logger;
}

/**
 * Implementation of the RoleDistributionVisualization interface
 */
export class RoleDistributionVisualizationImpl implements RoleDistributionVisualization {
  private logger: Logger;
  private distributions: Map<string, DistributionData>;

  /**
   * Create a new role distribution visualization service
   */
  constructor(config: RoleDistributionVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.distributions = new Map();
    this.logger.info('RoleDistributionVisualizationImpl initialized');
  }

  /**
   * Create a new distribution visualization
   */
  createDistributionVisualization(meetingId: string): string {
    const id = `distribution-${uuidv4()}`;
    
    // Initialize empty distribution
    const expertiseDistribution: Record<AgentExpertise, number> = Object.values(AgentExpertise).reduce((acc, expertise) => {
      acc[expertise] = 0;
      return acc;
    }, {} as Record<AgentExpertise, number>);
    
    this.distributions.set(id, {
      id,
      meetingId,
      expertiseDistribution,
      specializations: {},
      elements: new Map<string, VisualizationElement>(),
      connections: new Map<string, VisualizationConnection>(),
      version: 1,
      timestamp: new Date()
    });
    
    this.logger.info(`Created role distribution visualization ${id} for meeting ${meetingId}`);
    return id;
  }

  /**
   * Update expertise distribution data
   */
  updateExpertiseDistribution(visualizationId: string, distribution: Record<AgentExpertise, number>): boolean {
    const visualization = this.distributions.get(visualizationId);
    
    if (!visualization) {
      this.logger.warn(`Visualization ${visualizationId} not found`);
      return false;
    }
    
    // Update the distribution
    visualization.expertiseDistribution = {...distribution};
    
    // Update the visualization
    this.updateVisualization(visualizationId);
    
    // Update metadata
    visualization.version += 1;
    visualization.timestamp = new Date();
    
    this.logger.info(`Updated expertise distribution in visualization ${visualizationId}`);
    return true;
  }

  /**
   * Visualize role distribution
   */
  visualizeRoleDistribution(visualizationId: string): VisualizationGraph {
    const visualization = this.distributions.get(visualizationId);
    
    if (!visualization) {
      this.logger.warn(`Visualization ${visualizationId} not found`);
      return {
        id: visualizationId,
        name: 'Not Found',
        elements: [],
        connections: [],
        layout: 'radial',
        timestamp: new Date(),
        version: 0
      };
    }
    
    // Ensure visualization is up to date
    this.updateVisualization(visualizationId);
    
    return {
      id: visualizationId,
      name: `Role Distribution for Meeting ${visualization.meetingId}`,
      description: 'Visualization of agent role distribution',
      elements: Array.from(visualization.elements.values()),
      connections: Array.from(visualization.connections.values()),
      layout: 'radial',
      timestamp: visualization.timestamp,
      version: visualization.version,
      metadata: {
        meetingId: visualization.meetingId,
        expertise: Object.entries(visualization.expertiseDistribution)
          .map(([expertise, count]) => ({ expertise, count }))
      }
    };
  }

  /**
   * Calculate distribution balance metrics
   */
  calculateDistributionBalance(visualizationId: string): {
    gaps: Record<AgentExpertise, number>;
    overallocations: Record<AgentExpertise, number>;
    balanceScore: number;
  } {
    const visualization = this.distributions.get(visualizationId);
    
    if (!visualization) {
      this.logger.warn(`Visualization ${visualizationId} not found`);
      return {
        gaps: {} as Record<AgentExpertise, number>,
        overallocations: {} as Record<AgentExpertise, number>,
        balanceScore: 0
      };
    }
    
    // Calculate ideal distribution (all expertise areas equally covered)
    const totalCoverage = Object.values(visualization.expertiseDistribution)
      .reduce((sum, count) => sum + count, 0);
    
    const expertiseCount = Object.keys(visualization.expertiseDistribution).length;
    const idealPerExpertise = totalCoverage / expertiseCount;
    
    // Calculate gaps and overallocations
    const gaps: Record<AgentExpertise, number> = {} as Record<AgentExpertise, number>;
    const overallocations: Record<AgentExpertise, number> = {} as Record<AgentExpertise, number>;
    
    for (const [expertise, count] of Object.entries(visualization.expertiseDistribution)) {
      const difference = count - idealPerExpertise;
      
      if (difference < 0) {
        gaps[expertise as AgentExpertise] = Math.abs(difference);
        overallocations[expertise as AgentExpertise] = 0;
      } else {
        gaps[expertise as AgentExpertise] = 0;
        overallocations[expertise as AgentExpertise] = difference;
      }
    }
    
    // Calculate balance score (0-1, higher is better balanced)
    let totalDeviation = 0;
    for (const [expertise, count] of Object.entries(visualization.expertiseDistribution)) {
      totalDeviation += Math.abs(count - idealPerExpertise);
    }
    
    // Normalize the score
    // Max deviation would be if all coverage was in one expertise
    const maxDeviation = totalCoverage * (1 - 1/expertiseCount);
    const balanceScore = maxDeviation > 0 ? 1 - (totalDeviation / maxDeviation) : 1;
    
    return {
      gaps,
      overallocations,
      balanceScore
    };
  }

  /**
   * Identify underserved expertise areas
   */
  identifyUnderservedAreas(visualizationId: string): AgentExpertise[] {
    const visualization = this.distributions.get(visualizationId);
    
    if (!visualization) {
      this.logger.warn(`Visualization ${visualizationId} not found`);
      return [];
    }
    
    const balance = this.calculateDistributionBalance(visualizationId);
    
    // Find areas with significant gaps
    const underservedAreas: AgentExpertise[] = [];
    
    for (const [expertise, gap] of Object.entries(balance.gaps)) {
      // Consider it underserved if gap > 0.5
      if (gap > 0.5) {
        underservedAreas.push(expertise as AgentExpertise);
      }
    }
    
    // Sort by gap size (largest first)
    underservedAreas.sort((a, b) => balance.gaps[b] - balance.gaps[a]);
    
    return underservedAreas;
  }

  /**
   * Update the visualization based on distribution data
   */
  private updateVisualization(visualizationId: string): void {
    const visualization = this.distributions.get(visualizationId);
    
    if (!visualization) {
      return;
    }
    
    // Clear existing elements and connections
    visualization.elements.clear();
    visualization.connections.clear();
    
    // Create center element
    const centerElementId = 'center';
    const centerElement: VisualizationElement = {
      id: centerElementId,
      type: VisualizationElementType.TOPIC,
      label: 'Team Expertise',
      description: 'Distribution of expertise across the team',
      properties: {},
      state: VisualizationElementState.ACTIVE,
      position: { x: 400, y: 300 },
      size: { width: 60, height: 60 },
      color: '#2196F3', // Blue
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    visualization.elements.set(centerElementId, centerElement);
    
    // Create elements for each expertise
    const expertiseEntries = Object.entries(visualization.expertiseDistribution);
    const totalCoverage = expertiseEntries.reduce((sum, [, count]) => sum + count, 0);
    
    expertiseEntries.forEach(([expertise, count], index) => {
      // Skip zero coverage
      if (count === 0) {
        return;
      }
      
      // Calculate position in a circle around the center
      const angle = (2 * Math.PI * index) / expertiseEntries.length;
      const radius = 200;
      const x = 400 + radius * Math.cos(angle);
      const y = 300 + radius * Math.sin(angle);
      
      // Size based on proportion of total coverage
      const proportion = count / totalCoverage;
      const size = 30 + proportion * 100;
      
      // Create element
      const elementId = `expertise-${expertise}`;
      const element: VisualizationElement = {
        id: elementId,
        type: VisualizationElementType.TOPIC,
        label: this.formatExpertiseName(expertise as AgentExpertise),
        description: `${count.toFixed(1)} units of coverage`,
        properties: {
          expertise,
          coverage: count,
          proportion
        },
        state: VisualizationElementState.ACTIVE,
        position: { x, y },
        size: { width: size, height: size },
        color: this.getColorForExpertise(expertise as AgentExpertise),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      visualization.elements.set(elementId, element);
      
      // Connect to center
      const connectionId = `connection-${expertise}`;
      const connection: VisualizationConnection = {
        id: connectionId,
        type: VisualizationConnectionType.RELATION,
        sourceId: centerElementId,
        targetId: elementId,
        label: '',
        strength: proportion,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      visualization.connections.set(connectionId, connection);
    });
    
    // Handle specializations if available
    if (Object.keys(visualization.specializations).length > 0) {
      // Create elements for major specializations
      const specializationEntries = Object.entries(visualization.specializations)
        .sort((a, b) => b[1] - a[1]) // Sort by count descending
        .slice(0, 5); // Take top 5
      
      specializationEntries.forEach(([specialization, count], index) => {
        // Calculate position in a wider circle
        const angle = (2 * Math.PI * index) / specializationEntries.length;
        const radius = 350;
        const x = 400 + radius * Math.cos(angle);
        const y = 300 + radius * Math.sin(angle);
        
        // Get expertise(s) from specialization string
        const expertiseNames = specialization.split('+');
        
        // Create element
        const elementId = `specialization-${index}`;
        const element: VisualizationElement = {
          id: elementId,
          type: VisualizationElementType.INSIGHT,
          label: expertiseNames.map(e => this.formatExpertiseName(e as AgentExpertise)).join(' + '),
          description: `${count} agents with this specialization`,
          properties: {
            specialization,
            count
          },
          state: VisualizationElementState.ACTIVE,
          position: { x, y },
          size: { width: 40 + count * 10, height: 40 + count * 10 },
          color: '#9C27B0', // Purple
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        visualization.elements.set(elementId, element);
        
        // Connect to related expertise elements
        expertiseNames.forEach(expertiseName => {
          const expertiseElementId = `expertise-${expertiseName}`;
          
          if (visualization.elements.has(expertiseElementId)) {
            const connectionId = `connection-spec-${index}-${expertiseName}`;
            const connection: VisualizationConnection = {
              id: connectionId,
              type: VisualizationConnectionType.DEPENDENCY,
              sourceId: elementId,
              targetId: expertiseElementId,
              label: '',
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            visualization.connections.set(connectionId, connection);
          }
        });
      });
    }
  }

  /**
   * Format expertise name for display
   */
  private formatExpertiseName(expertise: AgentExpertise): string {
    // Convert SNAKE_CASE to Title Case
    return expertise
      .split('_')
      .map(word => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Get color for expertise
   */
  private getColorForExpertise(expertise: AgentExpertise): string {
    const colorMap: Record<AgentExpertise, string> = {
      [AgentExpertise.COORDINATION]: '#4285F4', // blue
      [AgentExpertise.SUMMARY_GENERATION]: '#34A853', // green
      [AgentExpertise.ACTION_ITEM_EXTRACTION]: '#FBBC05', // yellow
      [AgentExpertise.DECISION_TRACKING]: '#EA4335', // red
      [AgentExpertise.TOPIC_ANALYSIS]: '#8F44AD', // purple
      [AgentExpertise.SENTIMENT_ANALYSIS]: '#1ABC9C', // teal
      [AgentExpertise.PARTICIPANT_DYNAMICS]: '#F39C12', // orange
      [AgentExpertise.CONTEXT_INTEGRATION]: '#7F8C8D', // gray
    };
    
    return colorMap[expertise] || '#000000';
  }

  /**
   * Compare the current distribution with an optimal distribution
   */
  compareDistributionWithOptimal(visualizationId: string): {
    gaps: Record<AgentExpertise, number>;
    overallocations: Record<AgentExpertise, number>;
    balanceScore: number;
  } {
    const visualization = this.distributions.get(visualizationId);
    
    if (!visualization) {
      this.logger.warn(`Visualization ${visualizationId} not found`);
      return {
        gaps: {} as Record<AgentExpertise, number>,
        overallocations: {} as Record<AgentExpertise, number>,
        balanceScore: 0
      };
    }
    
    // For this implementation, we'll use an equal distribution across expertise types as optimal
    const totalCoverage = Object.values(visualization.expertiseDistribution)
      .reduce((sum, count) => sum + count, 0);
    
    const expertiseCount = Object.keys(visualization.expertiseDistribution).length;
    const idealPerExpertise = totalCoverage / expertiseCount;
    
    // Calculate gaps and overallocations
    const gaps: Record<AgentExpertise, number> = {} as Record<AgentExpertise, number>;
    const overallocations: Record<AgentExpertise, number> = {} as Record<AgentExpertise, number>;
    
    for (const expertise of Object.values(AgentExpertise)) {
      const current = visualization.expertiseDistribution[expertise] || 0;
      const optimal = idealPerExpertise;
      
      if (current < optimal) {
        gaps[expertise] = optimal - current;
        overallocations[expertise] = 0;
      } else {
        gaps[expertise] = 0;
        overallocations[expertise] = Math.max(0, current - optimal);
      }
    }
    
    // Calculate balance score (0-1, higher is better)
    let totalGap = 0;
    let totalOptimal = totalCoverage;
    
    for (const expertise of Object.values(AgentExpertise)) {
      totalGap += gaps[expertise];
    }
    
    const balanceScore = totalOptimal > 0 ? 
      Math.max(0, 1 - (totalGap / totalOptimal)) : 0;
    
    return {
      gaps,
      overallocations,
      balanceScore
    };
  }
} 