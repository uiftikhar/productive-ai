/**
 * MongoDB In-Memory Mock
 * 
 * This module provides a simplified in-memory mock of MongoDB for testing
 * without requiring a real MongoDB instance or mongodb-memory-server.
 */

import { jest } from '@jest/globals';

/**
 * Configuration for MongoDB mock
 */
export interface MongoDbMockConfig {
  /**
   * Initial data to populate the database with
   */
  initialData?: Record<string, any[]>;
  
  /**
   * Whether to enable query and command logging
   */
  debug?: boolean;
}

// Operation log entry interface
interface OperationLogEntry {
  collection: string;
  operation: string;
  params?: any;
  result?: any;
  timestamp: number;
}

// Document interface
interface Document {
  _id?: string;
  [key: string]: any;
}

/**
 * Creates a simplified MongoDB mock for testing
 */
export async function createMongoDbMock(config: MongoDbMockConfig = {}) {
  const {
    initialData = {},
    debug = false
  } = config;

  // In-memory database
  const dbStore: Record<string, Document[]> = {};
  
  // Operation log
  const operationLog: OperationLogEntry[] = [];
  
  // Initialize collections with data
  Object.entries(initialData).forEach(([collection, documents]) => {
    dbStore[collection] = [...documents];
    log(collection, 'insertMany', { count: documents.length }, { insertedCount: documents.length });
  });

  /**
   * Log operations for testing/debugging
   */
  function log(collection: string, operation: string, params?: any, result?: any) {
    if (debug) {
      console.log(`MongoDB: ${collection}.${operation}`, params);
    }
    
    operationLog.push({
      collection,
      operation,
      params,
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Collection mock with basic CRUD operations
   */
  function createCollection(name: string) {
    // Ensure collection exists
    if (!dbStore[name]) {
      dbStore[name] = [];
    }
    
    return {
      // Find documents
      find: function(query: Record<string, any> = {}) {
        log(name, 'find', query);
        
        const results = dbStore[name].filter(doc => 
          Object.entries(query).every(([key, value]) => doc[key] === value)
        );
        
        return {
          toArray: async () => results
        };
      },
      
      // Find a single document
      findOne: async function(query: Record<string, any> = {}) {
        log(name, 'findOne', query);
        
        return dbStore[name].find(doc => 
          Object.entries(query).every(([key, value]) => doc[key] === value)
        ) || null;
      },
      
      // Insert a document
      insertOne: async function(doc: Document) {
        log(name, 'insertOne', doc);
        
        // Add _id if not present
        const docToInsert = { ...doc };
        if (!docToInsert._id) {
          docToInsert._id = Math.random().toString(36).substring(2, 15);
        }
        
        dbStore[name].push(docToInsert);
        
        const result = { 
          acknowledged: true, 
          insertedId: docToInsert._id 
        };
        
        log(name, 'insertOne:result', null, result);
        return result;
      },
      
      // Insert multiple documents
      insertMany: async function(docs: Document[]) {
        log(name, 'insertMany', { count: docs.length });
        
        const docsToInsert = docs.map((doc: Document) => {
          const newDoc = { ...doc };
          if (!newDoc._id) {
            newDoc._id = Math.random().toString(36).substring(2, 15);
          }
          return newDoc;
        });
        
        dbStore[name].push(...docsToInsert);
        
        const result = { 
          acknowledged: true, 
          insertedCount: docs.length,
          insertedIds: docsToInsert.map((d: Document) => d._id)
        };
        
        log(name, 'insertMany:result', null, result);
        return result;
      },
      
      // Update a document
      updateOne: async function(query: Record<string, any>, update: { $set?: Record<string, any> }) {
        log(name, 'updateOne', { query, update });
        
        const index = dbStore[name].findIndex(doc => 
          Object.entries(query).every(([key, value]) => doc[key] === value)
        );
        
        let modifiedCount = 0;
        
        if (index !== -1) {
          if (update.$set) {
            dbStore[name][index] = {
              ...dbStore[name][index],
              ...update.$set
            };
            modifiedCount = 1;
          }
        }
        
        const result = { 
          acknowledged: true, 
          modifiedCount
        };
        
        log(name, 'updateOne:result', null, result);
        return result;
      },
      
      // Delete a document
      deleteOne: async function(query: Record<string, any>) {
        log(name, 'deleteOne', query);
        
        const initialLength = dbStore[name].length;
        const index = dbStore[name].findIndex(doc => 
          Object.entries(query).every(([key, value]) => doc[key] === value)
        );
        
        let deletedCount = 0;
        
        if (index !== -1) {
          dbStore[name].splice(index, 1);
          deletedCount = 1;
        }
        
        const result = { 
          acknowledged: true, 
          deletedCount
        };
        
        log(name, 'deleteOne:result', null, result);
        return result;
      },
      
      // Delete multiple documents
      deleteMany: async function(query: Record<string, any> = {}) {
        log(name, 'deleteMany', query);
        
        const initialLength = dbStore[name].length;
        
        if (Object.keys(query).length === 0) {
          // Delete all documents
          dbStore[name] = [];
        } else {
          dbStore[name] = dbStore[name].filter(doc => 
            !Object.entries(query).every(([key, value]) => doc[key] === value)
          );
        }
        
        const deletedCount = initialLength - dbStore[name].length;
        
        const result = { 
          acknowledged: true, 
          deletedCount
        };
        
        log(name, 'deleteMany:result', null, result);
        return result;
      },
      
      // Count documents
      countDocuments: async function(query: Record<string, any> = {}) {
        log(name, 'countDocuments', query);
        
        const count = dbStore[name].filter(doc => 
          Object.entries(query).every(([key, value]) => doc[key] === value)
        ).length;
        
        log(name, 'countDocuments:result', null, count);
        return count;
      }
    };
  }

  // Create db interface
  const db = {
    collection: function(name: string) {
      return createCollection(name);
    },
    
    listCollections: function() {
      return {
        toArray: async function() {
          return Object.keys(dbStore).map(name => ({ name }));
        }
      };
    }
  };

  return {
    // Mongodb client interface
    client: {
      db: function() { return db; },
      close: async function() { /* No-op */ }
    },
    
    // Database interface
    db,
    
    // Get collection helper
    getCollection: function(name: string) {
      return createCollection(name);
    },
    
    // Get operation logs
    getOperationLog: function(filter?: (log: OperationLogEntry) => boolean) {
      return filter ? operationLog.filter(filter) : [...operationLog];
    },
    
    // Clear operation logs
    clearOperationLog: function() {
      operationLog.length = 0;
    },
    
    // Clear a collection
    clearCollection: async function(name: string) {
      dbStore[name] = [];
      log(name, 'clear', { all: true });
    },
    
    // Clear all collections
    clearAllCollections: async function() {
      Object.keys(dbStore).forEach(name => {
        dbStore[name] = [];
        log(name, 'clear', { all: true });
      });
    },
    
    // URI mock
    getUri: function() {
      return 'mongodb://inmemory:27017/testdb';
    },
    
    // Stop mock
    stop: async function() {
      // Nothing to clean up
    }
  };
} 