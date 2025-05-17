import axios from 'axios';
import { Transcript } from '@/types/transcript';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * API service for transcript operations
 */
export const transcriptApi = {
  /**
   * Get all transcripts for the current user
   */
  async getTranscripts(): Promise<Transcript[]> {
    const response = await axios.get(`${API_URL}/api/transcripts`, {
      withCredentials: true,
    });
    return response.data;
  },

  /**
   * Get a single transcript by ID
   */
  async getTranscript(id: string): Promise<Transcript> {
    const response = await axios.get(`${API_URL}/api/transcripts/${id}`, {
      withCredentials: true,
    });
    return response.data;
  },

  /**
   * Upload a new transcript file
   */
  async uploadTranscript(file: File, metadata?: Record<string, any>): Promise<Transcript> {
    const formData = new FormData();
    formData.append('file', file);
    
    // Add metadata if provided
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    const response = await axios.post(`${API_URL}/api/transcripts/upload`, formData, {
      withCredentials: true,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  /**
   * Update transcript metadata or content
   */
  async updateTranscript(id: string, data: Partial<Transcript>): Promise<Transcript> {
    const response = await axios.put(`${API_URL}/api/transcripts/${id}`, data, {
      withCredentials: true,
    });
    return response.data;
  },

  /**
   * Delete a transcript
   */
  async deleteTranscript(id: string): Promise<void> {
    await axios.delete(`${API_URL}/api/transcripts/${id}`, {
      withCredentials: true,
    });
  },

  /**
   * Analyze a transcript
   */
  async analyzeTranscript(id: string): Promise<Transcript> {
    const response = await axios.post(
      `${API_URL}/api/transcripts/${id}/analyze`,
      {},
      {
        withCredentials: true,
      }
    );
    return response.data;
  },

  /**
   * Search transcripts
   */
  async searchTranscripts(query: string): Promise<Transcript[]> {
    const response = await axios.get(`${API_URL}/api/transcripts/search`, {
      params: { query },
      withCredentials: true,
    });
    return response.data;
  },
}; 