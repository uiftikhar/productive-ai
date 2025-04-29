/**
 * String utility functions
 */

/**
 * Calculate word overlap between two strings
 * Returns a score between 0 and 1 representing the degree of overlap
 */
export function wordOverlap(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  // Normalize strings and split into words
  const words1 = new Set(
    str1.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
  
  const words2 = new Set(
    str2.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  // Count overlapping words
  let overlap = 0;
  for (const word of words1) {
    if (words2.has(word)) {
      overlap++;
    }
  }
  
  // Calculate Jaccard similarity (intersection / union)
  return overlap / (words1.size + words2.size - overlap);
} 