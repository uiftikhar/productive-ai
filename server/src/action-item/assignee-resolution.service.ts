import { Logger } from '../shared/logger/logger.interface';
import { ConsoleLogger } from '../shared/logger/console-logger';

/**
 * Interface for organizational user data
 */
export interface OrgUser {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  aliases?: string[]; // Nicknames, abbreviations
  department?: string;
  role?: string;
  manager?: string;
  directReports?: string[];
}

/**
 * Interface for a resolved assignee
 */
export interface ResolvedAssignee {
  originalText: string;
  userId?: string;
  confidence: number; // 0-1 score indicating confidence in the resolution
  possibleMatches?: OrgUser[]; // For ambiguous cases
  needsVerification: boolean;
  resolutionMethod: 'exact' | 'fuzzy' | 'contextual' | 'unresolved';
}

/**
 * Service for resolving assignee references in meeting transcripts
 * to actual organizational users
 */
export class AssigneeResolutionService {
  private logger: Logger;
  private organizationalData: OrgUser[] = [];
  private nameToUserMap: Map<string, OrgUser> = new Map();
  private emailToUserMap: Map<string, OrgUser> = new Map();
  private idToUserMap: Map<string, OrgUser> = new Map();
  private participantCache: Map<string, OrgUser[]> = new Map();

  constructor(options: {
    logger?: Logger;
    organizationalData?: OrgUser[];
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    
    if (options.organizationalData) {
      this.updateOrganizationalData(options.organizationalData);
    }
  }

  /**
   * Update the organizational data used for assignee resolution
   * @param userData Array of organization users
   */
  updateOrganizationalData(userData: OrgUser[]): void {
    this.organizationalData = userData;
    this.nameToUserMap.clear();
    this.emailToUserMap.clear();
    this.idToUserMap.clear();
    
    // Index users by name variations and email for fast lookup
    for (const user of userData) {
      this.idToUserMap.set(user.id, user);
      this.emailToUserMap.set(user.email.toLowerCase(), user);
      
      // Add full name
      this.nameToUserMap.set(user.fullName.toLowerCase(), user);
      
      // Add first name
      this.nameToUserMap.set(user.firstName.toLowerCase(), user);
      
      // Add last name
      this.nameToUserMap.set(user.lastName.toLowerCase(), user);
      
      // Add first+last with no space (e.g., "johnsmith")
      this.nameToUserMap.set(
        (user.firstName + user.lastName).toLowerCase(),
        user
      );
      
      // Add any aliases
      if (user.aliases) {
        for (const alias of user.aliases) {
          this.nameToUserMap.set(alias.toLowerCase(), user);
        }
      }
    }
    
    this.logger.info(`Updated organizational data with ${userData.length} users`);
  }

  /**
   * Cache meeting participants for faster resolution
   * @param meetingId Meeting identifier
   * @param participants List of participant IDs
   */
  setMeetingParticipants(meetingId: string, participantIds: string[]): void {
    const participants = participantIds
      .map(id => this.idToUserMap.get(id))
      .filter(user => user !== undefined) as OrgUser[];
    
    this.participantCache.set(meetingId, participants);
    this.logger.debug(`Cached ${participants.length} participants for meeting ${meetingId}`);
  }

  /**
   * Resolve an assignee reference to actual organizational user(s)
   * @param assigneeText Text referring to an assignee
   * @param meetingId Optional meeting ID to check against participants
   * @param surroundingText Optional context to help resolve ambiguous references
   * @returns Resolved assignee information
   */
  resolveAssignee(
    assigneeText: string, 
    meetingId?: string,
    surroundingText?: string
  ): ResolvedAssignee {
    if (!assigneeText || assigneeText.trim().length === 0) {
      return {
        originalText: assigneeText,
        confidence: 0,
        needsVerification: true,
        resolutionMethod: 'unresolved'
      };
    }
    
    const normalizedText = assigneeText.toLowerCase().trim();
    
    // 1. Try exact match by name or email
    if (this.nameToUserMap.has(normalizedText)) {
      const user = this.nameToUserMap.get(normalizedText);
      return {
        originalText: assigneeText,
        userId: user?.id,
        confidence: 0.95,
        needsVerification: false,
        resolutionMethod: 'exact'
      };
    }
    
    if (this.emailToUserMap.has(normalizedText)) {
      const user = this.emailToUserMap.get(normalizedText);
      return {
        originalText: assigneeText,
        userId: user?.id,
        confidence: 1.0,
        needsVerification: false,
        resolutionMethod: 'exact'
      };
    }
    
    // 2. Check meeting participants first (if available)
    if (meetingId && this.participantCache.has(meetingId)) {
      const participants = this.participantCache.get(meetingId) || [];
      
      // Prioritize meeting participants for first name matching
      const matchingParticipants = participants.filter(p => 
        p.firstName.toLowerCase() === normalizedText || 
        p.lastName.toLowerCase() === normalizedText ||
        p.aliases?.some(alias => alias.toLowerCase() === normalizedText)
      );
      
      if (matchingParticipants.length === 1) {
        return {
          originalText: assigneeText,
          userId: matchingParticipants[0].id,
          confidence: 0.9,
          needsVerification: false,
          resolutionMethod: 'contextual'
        };
      }
      
      if (matchingParticipants.length > 1) {
        // Ambiguous match among participants
        return {
          originalText: assigneeText,
          possibleMatches: matchingParticipants,
          confidence: 0.7,
          needsVerification: true,
          resolutionMethod: 'contextual'
        };
      }
    }
    
    // 3. Try fuzzy matching
    const fuzzyMatches = this.findFuzzyMatches(normalizedText);
    
    if (fuzzyMatches.length === 1) {
      return {
        originalText: assigneeText,
        userId: fuzzyMatches[0].user.id,
        confidence: 0.8,
        needsVerification: fuzzyMatches[0].confidence < 0.9,
        resolutionMethod: 'fuzzy'
      };
    }
    
    if (fuzzyMatches.length > 1) {
      // Multiple possible matches, use surrounding text to disambiguate if available
      if (surroundingText) {
        const disambiguated = this.disambiguateWithContext(fuzzyMatches, surroundingText);
        if (disambiguated) {
          return {
            originalText: assigneeText,
            userId: disambiguated.id,
            confidence: 0.85,
            needsVerification: true,
            resolutionMethod: 'contextual'
          };
        }
      }
      
      // Return all possible matches if we can't disambiguate
      return {
        originalText: assigneeText,
        possibleMatches: fuzzyMatches.map(match => match.user),
        confidence: 0.6,
        needsVerification: true,
        resolutionMethod: 'fuzzy'
      };
    }
    
    // No match found
    return {
      originalText: assigneeText,
      confidence: 0,
      needsVerification: true,
      resolutionMethod: 'unresolved'
    };
  }

  /**
   * Find fuzzy matches for an assignee name
   */
  private findFuzzyMatches(input: string): Array<{user: OrgUser, confidence: number}> {
    const matches: Array<{user: OrgUser, confidence: number}> = [];
    
    // Simple fuzzy matching based on substring containment and edit distance
    for (const user of this.organizationalData) {
      // Check first name contains or is contained in the input
      const firstNameLower = user.firstName.toLowerCase();
      const lastNameLower = user.lastName.toLowerCase();
      
      if (firstNameLower.includes(input) || input.includes(firstNameLower)) {
        matches.push({
          user,
          confidence: this.calculateSimilarity(input, firstNameLower)
        });
        continue;
      }
      
      // Check last name
      if (lastNameLower.includes(input) || input.includes(lastNameLower)) {
        matches.push({
          user,
          confidence: this.calculateSimilarity(input, lastNameLower)
        });
        continue;
      }
      
      // Check full name
      const fullNameLower = user.fullName.toLowerCase();
      if (fullNameLower.includes(input) || input.includes(fullNameLower)) {
        matches.push({
          user,
          confidence: this.calculateSimilarity(input, fullNameLower)
        });
        continue;
      }
      
      // Check aliases
      if (user.aliases) {
        for (const alias of user.aliases) {
          const aliasLower = alias.toLowerCase();
          if (aliasLower.includes(input) || input.includes(aliasLower)) {
            matches.push({
              user,
              confidence: this.calculateSimilarity(input, aliasLower)
            });
            break;
          }
        }
      }
    }
    
    // Sort by confidence and return top 3
    return matches
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }

  /**
   * Calculate string similarity based on edit distance (Levenshtein)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    // Normalize strings for comparison
    const a = str1.toLowerCase().trim();
    const b = str2.toLowerCase().trim();
    
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;
    
    // Calculate levenshtein distance
    const matrix: number[][] = [];
    
    // Initialize the matrix
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill the matrix
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    
    // Convert distance to similarity score
    const maxLength = Math.max(a.length, b.length);
    const distance = matrix[a.length][b.length];
    const similarity = 1 - (distance / maxLength);
    
    return similarity;
  }

  /**
   * Use surrounding context to disambiguate between multiple possible assignees
   */
  private disambiguateWithContext(
    matches: Array<{user: OrgUser, confidence: number}>, 
    context: string
  ): OrgUser | null {
    const contextLower = context.toLowerCase();
    
    // Try to find role/department mentions that match a user
    for (const match of matches) {
      const user = match.user;
      
      // Check for role mention
      if (user.role && contextLower.includes(user.role.toLowerCase())) {
        return user;
      }
      
      // Check for department mention
      if (user.department && contextLower.includes(user.department.toLowerCase())) {
        return user;
      }
      
      // Check for full name in context
      if (contextLower.includes(user.fullName.toLowerCase())) {
        return user;
      }
    }
    
    // If no contextual match, return the highest confidence match
    return matches.length > 0 ? matches[0].user : null;
  }

  /**
   * Batch process assignee resolution for multiple assignees
   * @param assigneeTexts Array of assignee text references
   * @param meetingId Optional meeting ID for context
   * @param surroundingTexts Optional context for each assignee
   * @returns Resolved assignees information
   */
  batchResolveAssignees(
    assigneeTexts: string[],
    meetingId?: string,
    surroundingTexts?: string[]
  ): ResolvedAssignee[] {
    return assigneeTexts.map((text, index) => {
      const context = surroundingTexts ? surroundingTexts[index] : undefined;
      return this.resolveAssignee(text, meetingId, context);
    });
  }

  /**
   * Verify ambiguous assignee resolutions with confirmation
   * @param assigneeResolution The original resolution result
   * @param selectedUserId The confirmed user ID
   * @returns Updated resolution with verified user
   */
  confirmAssigneeResolution(
    assigneeResolution: ResolvedAssignee,
    selectedUserId: string
  ): ResolvedAssignee {
    // Find the selected user
    const selectedUser = this.idToUserMap.get(selectedUserId);
    
    if (!selectedUser) {
      return assigneeResolution; // No change if user not found
    }
    
    return {
      ...assigneeResolution,
      userId: selectedUserId,
      confidence: 1.0, // Perfect confidence after manual verification
      needsVerification: false,
      possibleMatches: undefined // Clear possible matches
    };
  }
} 