import { Logger } from '../../../shared/logger/logger.interface';
import { 
  RawTranscript, 
  SpeakerIdentity, 
  SpeakerMap, 
  TranscriptEntry 
} from './enhanced-transcript-processor';

/**
 * Options for speaker identification service
 */
export interface SpeakerIdentificationOptions {
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Known participants to match against
   */
  knownParticipants?: Array<{
    id: string;
    name: string;
    aliases?: string[];
  }>;
  
  /**
   * Minimum similarity threshold for name matching (0-1)
   */
  similarityThreshold?: number;
  
  /**
   * Whether to use fuzzy matching for similar names
   */
  useFuzzyMatching?: boolean;
}

/**
 * Normalized speaker mapping
 */
export interface NormalizedSpeakerMap {
  /**
   * Mapping of speaker IDs to normalized IDs
   */
  idMapping: Map<string, string>;
  
  /**
   * Full speaker identities
   */
  speakers: SpeakerMap;
}

/**
 * Participant information
 */
export interface ParticipantInfo {
  /**
   * Participant ID
   */
  id: string;
  
  /**
   * Participant name
   */
  name: string;
  
  /**
   * Alternative names/aliases for this participant
   */
  aliases: string[];
  
  /**
   * Additional metadata about the participant
   */
  metadata?: Record<string, any>;
}

/**
 * Mapping of speaker IDs to known participants
 */
export type ParticipantMap = Map<string, ParticipantInfo>;

/**
 * Speaker identification service
 * Identifies speakers in transcripts and normalizes speaker identities
 */
export class SpeakerIdentificationService {
  private logger?: Logger;
  private knownParticipants: ParticipantInfo[];
  private similarityThreshold: number;
  private useFuzzyMatching: boolean;
  
  /**
   * Create a new speaker identification service
   */
  constructor(options: SpeakerIdentificationOptions = {}) {
    this.logger = options.logger;
    this.similarityThreshold = options.similarityThreshold || 0.8;
    this.useFuzzyMatching = options.useFuzzyMatching !== false;
    
    // Initialize known participants
    this.knownParticipants = (options.knownParticipants || []).map(p => ({
      id: p.id,
      name: p.name,
      aliases: [...(p.aliases || []), p.name]
    }));
  }
  
  /**
   * Identify speakers in a transcript
   * 
   * @param transcript - Raw transcript to identify speakers in
   * @returns Speaker map with identities
   */
  async identifySpeakers(transcript: RawTranscript): Promise<SpeakerMap> {
    this.logger?.info(`Identifying speakers in transcript ${transcript.meetingId}`, {
      entryCount: transcript.entries.length
    });
    
    try {
      // Initial speaker map based on raw speaker IDs and names
      const initialMap = this.createInitialSpeakerMap(transcript.entries);
      
      // Merge similar speakers (corrects for minor naming differences)
      const mergedMap = await this.mergeSpeakerIdentities(initialMap);
      
      // Match with known participants if available
      if (this.knownParticipants.length > 0) {
        return await this.matchSpeakersWithKnownParticipants(mergedMap);
      }
      
      return mergedMap;
    } catch (error) {
      this.logger?.error('Error identifying speakers', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        meetingId: transcript.meetingId
      });
      
      // Fall back to initial mapping
      return this.createInitialSpeakerMap(transcript.entries);
    }
  }
  
  /**
   * Register known participants for matching
   * 
   * @param participants - Known participants to register
   */
  registerKnownParticipants(participants: ParticipantInfo[]): void {
    for (const participant of participants) {
      // Add if not already registered
      const existing = this.knownParticipants.find(p => p.id === participant.id);
      if (!existing) {
        this.knownParticipants.push({
          ...participant,
          aliases: [...(participant.aliases || []), participant.name]
        });
      }
    }
  }
  
  /**
   * Create initial speaker map from transcript entries
   * 
   * @param entries - Transcript entries
   * @returns Initial speaker map
   */
  private createInitialSpeakerMap(entries: TranscriptEntry[]): SpeakerMap {
    const speakerMap = new Map<string, SpeakerIdentity>();
    
    // Gather all unique speaker references
    for (const entry of entries) {
      if (!speakerMap.has(entry.speakerId)) {
        speakerMap.set(entry.speakerId, {
          id: entry.speakerId,
          name: entry.speakerName || `Speaker ${entry.speakerId}`,
          confidence: 1.0,  // High confidence for exact ID matches
          alternativeIds: []
        });
      }
    }
    
    return speakerMap;
  }
  
  /**
   * Merge speaker identities that likely refer to the same person
   * 
   * @param speakerMap - Initial speaker map
   * @returns Merged speaker map
   */
  async mergeSpeakerIdentities(speakerMap: SpeakerMap): Promise<SpeakerMap> {
    const mergedMap = new Map<string, SpeakerIdentity>();
    const processedIds = new Set<string>();
    
    // Convert to array for easier processing
    const speakers = Array.from(speakerMap.values());
    
    for (const speaker of speakers) {
      // Skip if already processed as part of a merge
      if (processedIds.has(speaker.id)) continue;
      
      // Find similar speakers
      const similarSpeakers = this.findSimilarSpeakers(speaker, speakers);
      
      if (similarSpeakers.length > 0) {
        // Create merged identity
        const mergedIdentity = this.createMergedIdentity(speaker, similarSpeakers);
        
        // Add to merged map with primary ID
        mergedMap.set(mergedIdentity.id, mergedIdentity);
        
        // Mark all merged speakers as processed
        processedIds.add(speaker.id);
        for (const similar of similarSpeakers) {
          processedIds.add(similar.id);
        }
      } else {
        // No similar speakers, keep as is
        mergedMap.set(speaker.id, { ...speaker });
        processedIds.add(speaker.id);
      }
    }
    
    return mergedMap;
  }
  
  /**
   * Match speakers with known participants
   * 
   * @param speakerMap - Speaker map to match
   * @returns Updated speaker map with matched participants
   */
  async matchSpeakersWithKnownParticipants(speakerMap: SpeakerMap): Promise<SpeakerMap> {
    const matchedMap = new Map<string, SpeakerIdentity>();
    
    for (const [speakerId, speaker] of speakerMap.entries()) {
      // Try to find matching known participant
      const participant = this.findMatchingParticipant(speaker);
      
      if (participant) {
        // Create matched identity
        matchedMap.set(speakerId, {
          id: participant.id,  // Use known participant ID
          name: participant.name,  // Use known participant name
          confidence: this.calculateMatchConfidence(speaker, participant),
          alternativeIds: [...(speaker.alternativeIds || []), speakerId]
        });
      } else {
        // No match found, keep original identity
        matchedMap.set(speakerId, { ...speaker });
      }
    }
    
    return matchedMap;
  }
  
  /**
   * Find similar speakers based on name similarity
   * 
   * @param speaker - Speaker to find similar speakers for
   * @param allSpeakers - All speakers to search
   * @returns Similar speakers
   */
  private findSimilarSpeakers(
    speaker: SpeakerIdentity,
    allSpeakers: SpeakerIdentity[]
  ): SpeakerIdentity[] {
    return allSpeakers.filter(other => {
      // Skip self comparison
      if (other.id === speaker.id) return false;
      
      // Check name similarity
      const similarity = this.calculateNameSimilarity(speaker.name, other.name);
      return similarity >= this.similarityThreshold;
    });
  }
  
  /**
   * Create a merged identity from similar speakers
   * 
   * @param primary - Primary speaker identity
   * @param similar - Similar speakers to merge
   * @returns Merged speaker identity
   */
  private createMergedIdentity(
    primary: SpeakerIdentity,
    similar: SpeakerIdentity[]
  ): SpeakerIdentity {
    // Choose the best name (usually the longest or most complete)
    const allNames = [primary.name, ...similar.map(s => s.name)];
    const bestName = this.selectBestName(allNames);
    
    // Collect all IDs
    const allIds = [primary.id, ...similar.map(s => s.id)];
    
    // Choose primary ID (usually the shortest or most canonical)
    const primaryId = this.selectPrimaryId(allIds);
    
    // Create alternative IDs list (excluding primary)
    const alternativeIds = allIds.filter(id => id !== primaryId);
    
    return {
      id: primaryId,
      name: bestName,
      confidence: 0.9,  // Lower confidence for merged identities
      alternativeIds
    };
  }
  
  /**
   * Find matching participant for a speaker
   * 
   * @param speaker - Speaker to find matching participant for
   * @returns Matching participant or undefined if none found
   */
  private findMatchingParticipant(speaker: SpeakerIdentity): ParticipantInfo | undefined {
    // Check for exact ID match first
    const exactMatch = this.knownParticipants.find(p => 
      p.id === speaker.id || p.aliases.includes(speaker.name)
    );
    
    if (exactMatch) return exactMatch;
    
    // Check for name similarity if fuzzy matching is enabled
    if (this.useFuzzyMatching) {
      let bestMatch: ParticipantInfo | undefined;
      let bestSimilarity = this.similarityThreshold;
      
      for (const participant of this.knownParticipants) {
        // Check against all aliases
        for (const alias of participant.aliases) {
          const similarity = this.calculateNameSimilarity(speaker.name, alias);
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = participant;
          }
        }
      }
      
      return bestMatch;
    }
    
    return undefined;
  }
  
  /**
   * Calculate match confidence between speaker and participant
   * 
   * @param speaker - Speaker identity
   * @param participant - Matching participant
   * @returns Confidence score (0-1)
   */
  private calculateMatchConfidence(
    speaker: SpeakerIdentity,
    participant: ParticipantInfo
  ): number {
    // Exact ID match has high confidence
    if (speaker.id === participant.id) {
      return 1.0;
    }
    
    // Exact name match with any alias has high confidence
    if (participant.aliases.includes(speaker.name)) {
      return 0.95;
    }
    
    // Fuzzy match has lower confidence
    let bestSimilarity = 0;
    for (const alias of participant.aliases) {
      const similarity = this.calculateNameSimilarity(speaker.name, alias);
      bestSimilarity = Math.max(bestSimilarity, similarity);
    }
    
    // Scale similarity to confidence (minimum 0.7)
    return Math.max(0.7, bestSimilarity);
  }
  
  /**
   * Calculate similarity between two names
   * 
   * @param name1 - First name
   * @param name2 - Second name
   * @returns Similarity score (0-1)
   */
  private calculateNameSimilarity(name1: string, name2: string): number {
    // Normalize names for comparison
    const normalized1 = this.normalizeName(name1);
    const normalized2 = this.normalizeName(name2);
    
    // Exact match after normalization
    if (normalized1 === normalized2) {
      return 1.0;
    }
    
    // Check if one is a subset of the other
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return 0.9;
    }
    
    // Compare first name only
    const firstName1 = normalized1.split(' ')[0];
    const firstName2 = normalized2.split(' ')[0];
    if (firstName1 === firstName2 && firstName1.length > 1) {
      return 0.85;
    }
    
    // Basic Levenshtein distance for more complex comparisons
    const distance = this.levenshteinDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);
    const similarity = 1 - distance / maxLength;
    
    return similarity;
  }
  
  /**
   * Normalize a name for comparison
   * 
   * @param name - Name to normalize
   * @returns Normalized name
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '')  // Remove punctuation
      .replace(/\s+/g, ' ')     // Normalize whitespace
      .trim();
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   * 
   * @param str1 - First string
   * @param str2 - Second string
   * @returns Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    
    // Create distance matrix
    const dist: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));
    
    // Initialize first row and column
    for (let i = 0; i <= m; i++) dist[i][0] = i;
    for (let j = 0; j <= n; j++) dist[0][j] = j;
    
    // Fill in the rest of the matrix
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        dist[i][j] = Math.min(
          dist[i - 1][j] + 1,      // deletion
          dist[i][j - 1] + 1,      // insertion
          dist[i - 1][j - 1] + cost // substitution
        );
      }
    }
    
    return dist[m][n];
  }
  
  /**
   * Select the best name from a list of names
   * 
   * @param names - List of names to choose from
   * @returns Best name
   */
  private selectBestName(names: string[]): string {
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    
    // Prefer names with both first and last name
    const fullNames = names.filter(name => name.includes(' '));
    if (fullNames.length > 0) {
      // Choose the longest full name
      return fullNames.sort((a, b) => b.length - a.length)[0];
    }
    
    // Fall back to longest name if no full names
    return names.sort((a, b) => b.length - a.length)[0];
  }
  
  /**
   * Select primary ID from a list of IDs
   * 
   * @param ids - List of IDs to choose from
   * @returns Primary ID
   */
  private selectPrimaryId(ids: string[]): string {
    if (ids.length === 0) return '';
    if (ids.length === 1) return ids[0];
    
    // Prefer IDs that look like real IDs (not auto-generated)
    const realIdPattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
    const realIds = ids.filter(id => realIdPattern.test(id));
    
    if (realIds.length > 0) {
      // Choose the shortest real ID
      return realIds.sort((a, b) => a.length - b.length)[0];
    }
    
    // Fall back to first ID
    return ids[0];
  }
} 