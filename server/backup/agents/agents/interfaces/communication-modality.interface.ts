/**
 * Communication Modality Interface
 *
 * Defines interfaces for multi-modal communication between agents,
 * supporting different formats and conversions between modalities.
 */

import { CommunicationModality } from './message-protocol.interface';

/**
 * Format type for content within a modality
 */
export enum ContentFormat {
  // Text formats
  PLAIN_TEXT = 'plain_text',
  MARKDOWN = 'markdown',
  HTML = 'html',

  // Structured data formats
  JSON = 'json',
  XML = 'xml',
  YAML = 'yaml',

  // Code formats
  CODE_SNIPPET = 'code_snippet',
  EXECUTABLE_CODE = 'executable_code',

  // Visualization formats
  SVG = 'svg',
  CHART_DATA = 'chart_data',
  PLOT_DATA = 'plot_data',

  // Reference formats
  KNOWLEDGE_POINTER = 'knowledge_pointer',
  ENTITY_REFERENCE = 'entity_reference',
  URL = 'url',
  FILE_REFERENCE = 'file_reference',
}

/**
 * Multi-modal content container
 */
export interface MultiModalContent {
  primaryModality: CommunicationModality;
  content: any;
  format: ContentFormat;
  alternateRepresentations?: {
    modality: CommunicationModality;
    content: any;
    format: ContentFormat;
  }[];
  metadata?: Record<string, any>;
}

/**
 * Content conversion options
 */
export interface ContentConversionOptions {
  preserveFormatting?: boolean;
  includeMetadata?: boolean;
  detailLevel?: 'low' | 'medium' | 'high';
  maxLength?: number;
  customSettings?: Record<string, any>;
}

/**
 * Conversion result from one modality/format to another
 */
export interface ContentConversionResult {
  sourceModality: CommunicationModality;
  sourceFormat: ContentFormat;
  targetModality: CommunicationModality;
  targetFormat: ContentFormat;
  convertedContent: any;
  conversionQuality: number; // 0-1 indicating how well the conversion preserved meaning
  lossyConversion: boolean; // Whether information was lost in conversion
  warnings?: string[];
  metadata?: Record<string, any>;
}

/**
 * Modality compatibility result
 */
export interface ModalityCompatibility {
  sourceModality: CommunicationModality;
  targetModality: CommunicationModality;
  compatibilityScore: number; // 0-1
  conversionPossible: boolean;
  potentialDataLoss: 'none' | 'minimal' | 'significant' | 'critical';
  recommendedFormats?: ContentFormat[];
}

/**
 * Agent modality capabilities
 */
export interface AgentModalityCapabilities {
  agentId: string;
  primaryModality: CommunicationModality;
  supportedModalities: CommunicationModality[];
  supportedFormats: Record<CommunicationModality, ContentFormat[]>;
  conversionCapabilities: Array<{
    sourceModality: CommunicationModality;
    sourceFormat: ContentFormat;
    targetModality: CommunicationModality;
    targetFormat: ContentFormat;
    conversionQuality: number; // 0-1
  }>;
  preferredFormats?: Record<CommunicationModality, ContentFormat>;
}

/**
 * Accessibility requirements for communication
 */
export interface AccessibilityRequirements {
  requirePlainText?: boolean;
  requireStructuredData?: boolean;
  requireDescriptiveText?: boolean;
  avoidModalities?: CommunicationModality[];
  preferredModalities?: CommunicationModality[];
  detailLevel?: 'low' | 'medium' | 'high';
  additionalRequirements?: Record<string, any>;
}

/**
 * Modality conversion error
 */
export interface ModalityConversionError {
  sourceModality: CommunicationModality;
  targetModality: CommunicationModality;
  sourceFormat: ContentFormat;
  targetFormat: ContentFormat;
  errorCode: string;
  errorMessage: string;
  failureReason:
    | 'incompatible_formats'
    | 'unsupported_conversion'
    | 'content_error'
    | 'system_error';
  timestamp: number;
  partialResult?: any;
  suggestions?: string[];
}

/**
 * Modality detection result
 */
export interface ModalityDetectionResult {
  detectedModality: CommunicationModality;
  detectedFormat: ContentFormat;
  confidence: number; // 0-1
  alternativeDetections?: Array<{
    modality: CommunicationModality;
    format: ContentFormat;
    confidence: number;
  }>;
}

/**
 * Context-aware formatting options
 */
export interface ContextAwareFormattingOptions {
  recipientId: string;
  messageContext?: string;
  conversationId?: string;
  previousModalityPreference?: CommunicationModality;
  intent?: string;
  importance?: 'low' | 'medium' | 'high';
  accessibilityRequirements?: AccessibilityRequirements;
  preserveOriginalModality?: boolean;
  allowMultipleModalities?: boolean;
  optimizeFor?: 'clarity' | 'detail' | 'conciseness' | 'persuasiveness';
}

/**
 * Format requirement specification
 */
export interface FormatRequirement {
  requiredFormat: ContentFormat;
  modality: CommunicationModality;
  reason: string;
  strictRequirement: boolean;
  fallbackFormats?: ContentFormat[];
}

/**
 * Format conversion quality metrics
 */
export interface ConversionQualityMetrics {
  semanticPreservation: number; // 0-1
  structuralIntegrity: number; // 0-1
  visualFidelity?: number; // 0-1, for visual content
  dataAccuracy?: number; // 0-1, for data representations
  codeExecutability?: number; // 0-1, for code
  overallQuality: number; // 0-1
  dataLoss: 'none' | 'minimal' | 'moderate' | 'significant';
}

/**
 * Content enrichment options for converting between modalities
 */
export interface ContentEnrichmentOptions {
  addContext?: boolean;
  expandAbbreviations?: boolean;
  includeMetadata?: boolean;
  addReferences?: boolean;
  enhanceFormatting?: boolean;
  customEnrichment?: Record<string, any>;
}

/**
 * Modality transformation pipeline
 */
export interface ModalityTransformationPipeline {
  id: string;
  name: string;
  description?: string;
  transformations: Array<{
    step: number;
    sourceModality: CommunicationModality;
    sourceFormat: ContentFormat;
    targetModality: CommunicationModality;
    targetFormat: ContentFormat;
    transformer: string; // ID of transformer to use
    options?: ContentConversionOptions;
  }>;
  fallbackPipeline?: string; // ID of fallback pipeline
  qualityThreshold?: number; // Minimum quality to continue pipeline
}

/**
 * Interface for content format detector
 */
export interface ContentFormatDetector {
  detectFormat(content: any): ModalityDetectionResult;
  supportsContent(content: any): boolean;
  getConfidence(content: any, format: ContentFormat): number;
}

/**
 * Interface for modality converter
 */
export interface ModalityConverter {
  canConvert(
    sourceModality: CommunicationModality,
    sourceFormat: ContentFormat,
    targetModality: CommunicationModality,
    targetFormat: ContentFormat,
  ): boolean;

  getCompatibility(
    sourceModality: CommunicationModality,
    targetModality: CommunicationModality,
  ): ModalityCompatibility;

  convert(
    content: any,
    sourceModality: CommunicationModality,
    sourceFormat: ContentFormat,
    targetModality: CommunicationModality,
    targetFormat: ContentFormat,
    options?: ContentConversionOptions,
  ): Promise<ContentConversionResult>;
}

/**
 * Interface for context-aware formatter
 */
export interface ContextAwareFormatter {
  formatForRecipient(
    content: any,
    sourceModality: CommunicationModality,
    sourceFormat: ContentFormat,
    options: ContextAwareFormattingOptions,
  ): Promise<MultiModalContent>;

  getRecipientCapabilities(
    recipientId: string,
  ): Promise<AgentModalityCapabilities | null>;

  recommendFormat(
    content: any,
    sourceModality: CommunicationModality,
    recipientId: string,
  ): Promise<FormatRequirement>;
}
