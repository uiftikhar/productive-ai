/**
 * Utility functions for object operations
 */

/**
 * Deep merge two objects
 * 
 * @param target - Target object to merge into
 * @param source - Source object to merge from
 * @returns The merged object
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const output = { ...target } as T;

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      const k = key as keyof T;
      if (isObject(source[k])) {
        if (!(k in target)) {
          output[k] = source[k] as T[keyof T];
        } else {
          output[k] = deepMerge(target[k], source[k] as any) as T[keyof T];
        }
      } else if (Array.isArray(source[k]) && Array.isArray(target[k])) {
        // For arrays, we replace the entire array rather than trying to merge
        output[k] = [...(source[k] as any)] as T[keyof T];
      } else {
        output[k] = source[k] as T[keyof T];
      }
    });
  }

  return output;
}

/**
 * Deep clone an object
 * 
 * @param obj - Object to clone
 * @returns Deep clone of the object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }

  const clone = {} as Record<string, any>;
  
  Object.keys(obj as Record<string, any>).forEach(key => {
    clone[key] = deepClone((obj as Record<string, any>)[key]);
  });

  return clone as T;
}

/**
 * Check if value is an object
 */
function isObject(item: any): item is Record<string, any> {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Get a nested property from an object using a dot-notation path
 * 
 * @param obj - Object to get property from
 * @param path - Path to property using dot notation (e.g., 'user.address.city')
 * @param defaultValue - Default value if property doesn't exist
 * @returns The property value or default value
 */
export function getNestedProperty<T>(
  obj: Record<string, any>, 
  path: string, 
  defaultValue?: T
): T | undefined {
  if (!obj || !path) {
    return defaultValue;
  }

  const properties = path.split('.');
  let current = obj;

  for (const property of properties) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return defaultValue;
    }
    
    current = current[property];
  }

  return (current !== undefined ? current : defaultValue) as T | undefined;
}

/**
 * Set a nested property on an object using a dot-notation path
 * 
 * @param obj - Object to set property on
 * @param path - Path to property using dot notation (e.g., 'user.address.city')
 * @param value - Value to set
 * @returns The modified object
 */
export function setNestedProperty<T extends Record<string, any>>(
  obj: T, 
  path: string, 
  value: any
): T {
  if (!obj || !path) {
    return obj;
  }

  const properties = path.split('.');
  const lastProp = properties.pop()!;
  let current = obj as Record<string, any>;

  // Create the path if it doesn't exist
  for (const property of properties) {
    if (current[property] === undefined || current[property] === null) {
      current[property] = {};
    } else if (typeof current[property] !== 'object') {
      // If path part exists but isn't an object, replace it with an object
      current[property] = {};
    }
    
    current = current[property];
  }

  // Set the value
  current[lastProp] = value;
  return obj;
} 