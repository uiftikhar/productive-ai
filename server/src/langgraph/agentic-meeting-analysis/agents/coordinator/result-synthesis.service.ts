/**
 * Result Synthesis Service for the Enhanced Supervisor Agent
 * 
 * This service handles the progressive task reassembly and synthesis of results
 * from multiple agents in the hierarchical agent system.
 */
import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { Logger } from '../../../../shared/logger/logger.interface';
import { 
  AgentOutput, 
  AgentResultCollection, 
  // TODO: Why is this oimported? Should this be used in the agent?
  AnalysisTask, 
  ConfidenceLevel, 
  FinalResult 
} from '../../interfaces/agent.interface';

/**
 * Configuration options for ResultSynthesisService
 */
export interface ResultSynthesisServiceConfig {
  logger: Logger;
  llm: ChatOpenAI;
  confidenceThreshold?: number;
  maxRetries?: number;
}

/**
 * Service for synthesizing results from multiple agents
 */
export class ResultSynthesisService {
  private logger: Logger;
  private llm: ChatOpenAI;
  private confidenceThreshold: number;
  private maxRetries: number;
  
  // Track synthesized results by meeting ID
  private synthesizedResults: Map<string, FinalResult> = new Map();
  
  // Intermediate results by task ID
  private intermediateResults: Map<string, {
    taskId: string;
    component: string;
    result: any;
    quality: number;
    timestamp: number;
  }> = new Map();
  
  /**
   * Create a new result synthesis service
   */
  constructor(config: ResultSynthesisServiceConfig) {
    this.logger = config.logger;
    this.llm = config.llm;
    this.confidenceThreshold = config.confidenceThreshold || 0.7;
    this.maxRetries = config.maxRetries || 2;
    
    this.logger.info('Initialized ResultSynthesisService');
  }
  
  /**
   * Register an intermediate result from a task
   */
  registerTaskResult(
    meetingId: string,
    taskId: string,
    component: string,
    result: any,
    quality: number = 0.8
  ): void {
    this.logger.debug(`Registering result for task ${taskId} (${component})`);
    
    const key = `${meetingId}:${taskId}`;
    this.intermediateResults.set(key, {
      taskId,
      component,
      result,
      quality,
      timestamp: Date.now()
    });
  }
  
  /**
   * Progressively synthesize results as they become available
   */
  async progressiveSynthesis(
    meetingId: string,
    taskIds: string[],
    minComponents: number = 2
  ): Promise<FinalResult | null> {
    // Get all registered results for these tasks
    const relevantResults = taskIds
      .map(taskId => this.intermediateResults.get(`${meetingId}:${taskId}`))
      .filter(Boolean) as Array<{
        taskId: string;
        component: string;
        result: any;
        quality: number;
        timestamp: number;
      }>;
    
    // If we don't have enough components yet, return null
    if (relevantResults.length < minComponents) {
      this.logger.debug(
        `Not enough components for synthesis: ${relevantResults.length}/${minComponents}`
      );
      return null;
    }
    
    // Group results by component
    const resultsByComponent: Record<string, any[]> = {};
    for (const result of relevantResults) {
      if (!resultsByComponent[result.component]) {
        resultsByComponent[result.component] = [];
      }
      resultsByComponent[result.component].push(result.result);
    }
    
    // Convert into a format suitable for synthesis
    const resultsForSynthesis = Object.entries(resultsByComponent).map(
      ([component, results]) => ({
        component,
        results,
        count: results.length
      })
    );
    
    // Create a synthetic agent result collection
    const resultCollection: AgentResultCollection = {
      taskId: taskIds.join(','),
      metadata: {
        // TODO: FIx this
        workerIds: taskIds,
        startTime: Date.now(),
        endTime: Date.now()
      },
      results: relevantResults.map(r => ({
        id: uuidv4(),
        confidence: this.qualityToConfidence(r.quality),
        content: r.result,
        metadata: {
          taskId: r.taskId,
          component: r.component,
          quality: r.quality
        },
        timestamp: r.timestamp
      }))
    };
    
    // Perform synthesis
    const finalResult = await this.synthesizeResults(resultCollection, meetingId);
    
    // Store the synthesized result
    this.synthesizedResults.set(meetingId, finalResult);
    
    return finalResult;
  }
  
  /**
   * Synthesize a collection of agent results into a final result
   */
  async synthesizeResults(
    resultCollection: AgentResultCollection,
    meetingId: string
  ): Promise<FinalResult> {
    this.logger.info(`Synthesizing ${resultCollection.results.length} results for meeting ${meetingId}`);
    
    try {
      // Group results by component type
      const resultsByType: Record<string, AgentOutput[]> = {};
      
      for (const result of resultCollection.results) {
        const componentType = result.metadata?.component || 'general';
        
        if (!resultsByType[componentType]) {
          resultsByType[componentType] = [];
        }
        
        resultsByType[componentType].push(result);
      }
      
      // Prepare the prompt with categorized results
      const promptContent = Object.entries(resultsByType)
        .map(([type, results]) => {
          return `
## ${type.toUpperCase()} COMPONENTS (${results.length} items)
${results.map((r, idx) => `
### Item ${idx + 1}
Content: ${JSON.stringify(r.content, null, 2)}
Confidence: ${r.confidence}
Timestamp: ${new Date(r.timestamp).toISOString()}
${r.reasoning ? `Reasoning: ${r.reasoning}` : ''}
`).join('\n')}
`;
        })
        .join('\n');
      
      const synthesisPrompt = `
You are an Analysis Synthesis Agent tasked with combining multiple analysis components 
into a coherent, comprehensive final result.

# MEETING ANALYSIS COMPONENTS TO SYNTHESIZE
${promptContent}

# SYNTHESIS INSTRUCTIONS
1. Combine these components into a cohesive analysis
2. Resolve any contradictions between components
3. Prioritize higher confidence components when conflicts exist
4. Create a concise executive summary (2-3 paragraphs)
5. Create sections for each analysis type
6. Extract key insights from across all components
7. Assess overall confidence based on component confidence levels

# OUTPUT FORMAT
Return your response as a valid JSON object with the following structure:
{
  "summary": "A 2-3 paragraph executive summary of the entire analysis",
  "sections": {
    "topics": [...],
    "actionItems": [...],
    "decisions": [...],
    "sentiment": {...},
    "participation": {...}
    // Include any other relevant sections
  },
  "insights": [
    "Key insight 1",
    "Key insight 2",
    // 3-5 key insights
  ],
  "confidence": "high" | "medium" | "low" | "uncertain"
}
`;
      
      // Call the LLM for synthesis
      const response = await this.llm.invoke([
        { type: 'human', content: synthesisPrompt }
      ]);
      
      const responseContent = response.content as string;
      
      // Extract JSON from response
      const jsonMatch = responseContent.match(/```json\n([\s\S]*?)\n```/) || 
                        responseContent.match(/```\n([\s\S]*?)\n```/) ||
                        responseContent.match(/{[\s\S]*?}/);
      
      let synthesisResult: any;
      
      if (jsonMatch) {
        try {
          synthesisResult = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } catch (e) {
          // Try to clean and parse the entire response
          const cleanedJson = responseContent
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();
          synthesisResult = JSON.parse(cleanedJson);
        }
      } else {
        throw new Error('Failed to extract valid JSON from LLM response');
      }
      
      // Convert to FinalResult format
      const finalResult: FinalResult = {
        summary: synthesisResult.summary,
        sections: synthesisResult.sections || {},
        insights: synthesisResult.insights || [],
        confidence: (synthesisResult.confidence as ConfidenceLevel) || ConfidenceLevel.MEDIUM,
        metadata: {
          componentsCount: resultCollection.results.length,
          componentTypes: Object.keys(resultsByType),
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };
      
      return finalResult;
    } catch (error) {
      this.logger.error(`Error synthesizing results: ${error}`);
      
      // Return a fallback result
      return this.createFallbackResult(resultCollection, meetingId);
    }
  }
  
  /**
   * Create a fallback result when synthesis fails
   */
  private createFallbackResult(
    resultCollection: AgentResultCollection,
    meetingId: string
  ): FinalResult {
    this.logger.info(`Creating fallback result for meeting ${meetingId}`);
    
    // Group results by component type
    const resultsByType: Record<string, any[]> = {};
    
    for (const result of resultCollection.results) {
      const componentType = result.metadata?.component || 'general';
      
      if (!resultsByType[componentType]) {
        resultsByType[componentType] = [];
      }
      
      resultsByType[componentType].push(result.content);
    }
    
    // Create a simple fallback result
    return {
      summary: "Automated synthesis failed. This is a simple aggregation of the analysis components.",
      sections: resultsByType,
      insights: ["Automated insight generation unavailable due to synthesis failure"],
      confidence: ConfidenceLevel.LOW,
      metadata: {
        fallback: true,
        componentsCount: resultCollection.results.length,
        componentTypes: Object.keys(resultsByType),
        timestamp: Date.now()
      },
      timestamp: Date.now()
    };
  }
  
  /**
   * Convert quality score to confidence level
   */
  private qualityToConfidence(quality: number): ConfidenceLevel {
    if (quality >= 0.8) {
      return ConfidenceLevel.HIGH;
    } else if (quality >= 0.6) {
      return ConfidenceLevel.MEDIUM;
    } else if (quality >= 0.4) {
      return ConfidenceLevel.LOW;
    } else {
      return ConfidenceLevel.UNCERTAIN;
    }
  }
  
  /**
   * Get the most recent synthesized result for a meeting
   */
  getLatestSynthesis(meetingId: string): FinalResult | null {
    return this.synthesizedResults.get(meetingId) || null;
  }
  
  /**
   * Get all intermediate results for a meeting
   */
  getIntermediateResults(meetingId: string): Array<{
    taskId: string;
    component: string;
    result: any;
    quality: number;
    timestamp: number;
  }> {
    return Array.from(this.intermediateResults.values())
      .filter(result => result.taskId.startsWith(meetingId));
  }
  
  /**
   * Clear results for a meeting
   */
  clearResults(meetingId: string): void {
    this.synthesizedResults.delete(meetingId);
    
    // Remove intermediate results for this meeting
    const keysToRemove: string[] = [];
    for (const [key] of this.intermediateResults.entries()) {
      if (key.startsWith(`${meetingId}:`)) {
        keysToRemove.push(key);
      }
    }
    
    for (const key of keysToRemove) {
      this.intermediateResults.delete(key);
    }
    
    this.logger.info(`Cleared results for meeting ${meetingId}`);
  }
} 