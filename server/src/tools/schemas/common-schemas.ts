/**
 * Common Zod schemas for tool validation
 * Part of Milestone 2.1: Tool Integration Enhancement
 */
import { z } from 'zod';

/**
 * Basic primitive schemas
 */
export const stringSchema = z.string().min(1);
export const optionalStringSchema = z.string().optional();
export const numberSchema = z.number();
export const optionalNumberSchema = z.number().optional();
export const booleanSchema = z.boolean();
export const optionalBooleanSchema = z.boolean().optional();
export const dateSchema = z.coerce.date();
export const optionalDateSchema = z.coerce.date().optional();

/**
 * ID schemas for common entities
 */
export const uuidSchema = z.string().uuid();
export const optionalUuidSchema = z.string().uuid().optional();
export const agentIdSchema = z.string().min(3).max(50);
export const userIdSchema = z.string().min(3).max(50);
export const sessionIdSchema = z.string().min(10).max(100);

/**
 * Text analysis schemas
 */
export const languageSchema = z.enum([
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'ko', 'ar'
]);

export const sentimentSchema = z.enum([
  'very_negative', 
  'negative', 
  'neutral', 
  'positive', 
  'very_positive'
]);

export const confidenceSchema = z.number().min(0).max(1);

/**
 * Common time and duration schemas
 */
export const timeRangeSchema = z.object({
  start: dateSchema,
  end: dateSchema
}).refine(data => data.start <= data.end, {
  message: "Start time must be before or equal to end time"
});

export const durationInSecondsSchema = z.number().int().nonnegative();

/**
 * Meeting schemas
 */
export const participantSchema = z.object({
  id: stringSchema,
  name: stringSchema,
  role: optionalStringSchema,
  isHost: optionalBooleanSchema.default(false)
});

export const participantsSchema = z.array(participantSchema);

export const speakerSchema = z.object({
  id: stringSchema,
  name: stringSchema,
  role: optionalStringSchema
});

export const utteranceSchema = z.object({
  speakerId: stringSchema,
  text: stringSchema,
  startTime: dateSchema,
  endTime: dateSchema,
  confidence: confidenceSchema.optional(),
  sentiment: sentimentSchema.optional()
});

export const utterancesSchema = z.array(utteranceSchema);

export const transcriptSchema = z.object({
  id: uuidSchema.optional().default(() => crypto.randomUUID()),
  meetingId: stringSchema,
  participants: participantsSchema,
  utterances: utterancesSchema,
  language: languageSchema.default('en'),
  startTime: dateSchema,
  endTime: dateSchema,
  metadata: z.record(z.string(), z.any()).optional()
});

/**
 * Tag schemas
 */
export const topicTagSchema = z.object({
  text: stringSchema,
  confidence: confidenceSchema,
  startTime: optionalDateSchema,
  endTime: optionalDateSchema,
});

export const topicTagsSchema = z.array(topicTagSchema);

/**
 * Action item schemas
 */
export const actionItemSchema = z.object({
  id: uuidSchema.optional().default(() => crypto.randomUUID()),
  text: stringSchema,
  assignedTo: z.array(stringSchema).optional(),
  dueDate: optionalDateSchema,
  priority: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).default('pending'),
  context: optionalStringSchema,
  confidence: confidenceSchema.optional(),
  utteranceIds: z.array(stringSchema).optional(),
  startTime: optionalDateSchema,
  endTime: optionalDateSchema,
});

export const actionItemsSchema = z.array(actionItemSchema);

/**
 * Summary schemas
 */
export const summarySchema = z.object({
  id: uuidSchema.optional().default(() => crypto.randomUUID()),
  text: stringSchema,
  type: z.enum(['executive', 'detailed', 'topical', 'custom']).default('detailed'),
  topics: topicTagsSchema.optional(),
  confidence: confidenceSchema.optional(),
  metadata: z.record(z.string(), z.any()).optional()
});

/**
 * Result schemas
 */
export const successResponseSchema = z.object({
  success: z.literal(true),
  data: z.any(),
  timestamp: dateSchema.default(() => new Date())
});

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: stringSchema,
  code: z.string().optional(),
  timestamp: dateSchema.default(() => new Date())
});

export const responseSchema = z.union([successResponseSchema, errorResponseSchema]);

/**
 * Pagination schemas
 */
export const paginationParamsSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional().default('asc')
});

export const paginatedResultSchema = z.object({
  data: z.array(z.any()),
  pagination: z.object({
    currentPage: z.number().int().positive(),
    totalPages: z.number().int().nonnegative(),
    totalItems: z.number().int().nonnegative(),
    itemsPerPage: z.number().int().positive()
  })
}); 