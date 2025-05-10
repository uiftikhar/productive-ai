/**
 * Request ID Utilities
 */
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Safely get or generate a request ID from a request object
 * 
 * @param req Express request object
 * @returns A string request ID, either from the header or newly generated
 */
export function getRequestId(req: Request): string {
  const headerValue = req.headers['x-request-id'];
  
  if (headerValue) {
    // Handle both string and string[] cases
    if (Array.isArray(headerValue)) {
      return headerValue[0] || uuidv4();
    }
    // Force string type
    return headerValue as string;
  }
  
  return uuidv4();
} 