import { PineconeConnectionService } from '../../../../../pinecone/pinecone-connection.service';

interface PineconeVector {
  id: string;
  values: number[];
  metadata?: Record<string, any>;
}

export class MockPineconeService {
  private vectors: Record<string, PineconeVector[]> = {};
  
  initialize = jest.fn().mockResolvedValue({});
  getIndex = jest.fn().mockResolvedValue({});
  
  queryVectors = jest.fn().mockImplementation((indexName: string, vector: number[], options: any, namespace?: string) => {
    const matches = this.vectors[indexName] || [];
    return Promise.resolve({ matches });
  });
  
  fetchVectors = jest.fn().mockImplementation((indexName: string, ids: string[], namespace?: string) => {
    const matches = this.vectors[indexName] ? 
      this.vectors[indexName].filter(vector => ids.includes(vector.id)) : 
      [];
    return Promise.resolve({ vectors: matches });
  });
  
  upsertVectors = jest.fn().mockImplementation((indexName: string, vectors: PineconeVector[], namespace?: string) => {
    if (!this.vectors[indexName]) {
      this.vectors[indexName] = [];
    }
    
    // Replace existing vectors or add new ones
    vectors.forEach(vector => {
      const existingIndex = this.vectors[indexName].findIndex(v => v.id === vector.id);
      if (existingIndex >= 0) {
        this.vectors[indexName][existingIndex] = vector;
      } else {
        this.vectors[indexName].push(vector);
      }
    });
    
    return Promise.resolve({ upsertedCount: vectors.length });
  });
  
  deleteVectors = jest.fn().mockImplementation((indexName: string, ids: string[], namespace?: string) => {
    if (this.vectors[indexName]) {
      const initialCount = this.vectors[indexName].length;
      this.vectors[indexName] = this.vectors[indexName].filter(vector => !ids.includes(vector.id));
      return Promise.resolve({ deletedCount: initialCount - this.vectors[indexName].length });
    }
    return Promise.resolve({ deletedCount: 0 });
  });
  
  // Helper methods for testing
  setVectors(indexName: string, vectors: PineconeVector[]) {
    this.vectors[indexName] = [...vectors];
  }
  
  getVectors(indexName: string): PineconeVector[] {
    return this.vectors[indexName] || [];
  }
  
  clearVectors() {
    this.vectors = {};
  }
}

export const createMockPineconeService = (): PineconeConnectionService => {
  const mockService = new MockPineconeService();
  return mockService as unknown as PineconeConnectionService;
}; 