import { UserContextService, ContextType } from './user-context.service.ts';
import { RecordMetadata } from '@pinecone-database/pinecone';

/**
 * Simple example showing how to use the UserContextService for RAG applications
 */
async function ragExample() {
  // Initialize the user context service
  const contextService = new UserContextService();

  // Example user ID
  const userId = 'user-123';

  // Example conversation ID
  const conversationId = 'conv-' + Date.now();

  // -------------------------------------------------
  // 1. Store conversation context
  // -------------------------------------------------

  // Simulate storing a conversation history
  // In a real application, you would use an embedding model to generate these vectors
  console.log('\n🔄 Storing conversation history...');

  // Mock embeddings (in a real app, these would come from an embedding model)
  const userEmbedding1 = Array(1536)
    .fill(0)
    .map(() => Math.random() * 2 - 1);
  const assistantEmbedding1 = Array(1536)
    .fill(0)
    .map(() => Math.random() * 2 - 1);
  const userEmbedding2 = Array(1536)
    .fill(0)
    .map(() => Math.random() * 2 - 1);

  // Store user message
  await contextService.storeConversationTurn(
    userId,
    conversationId,
    'What can you tell me about machine learning frameworks?',
    userEmbedding1,
    'user',
  );

  // Store assistant response
  await contextService.storeConversationTurn(
    userId,
    conversationId,
    'Machine learning frameworks are software libraries that help developers build models without writing algorithms from scratch. Popular ones include TensorFlow, PyTorch, scikit-learn, and Keras.',
    assistantEmbedding1,
    'assistant',
  );

  // Store follow-up question
  await contextService.storeConversationTurn(
    userId,
    conversationId,
    'Which one would you recommend for a beginner?',
    userEmbedding2,
    'user',
  );

  // -------------------------------------------------
  // 2. Store document chunks
  // -------------------------------------------------

  // Sample document ID
  const documentId = 'doc-ml-frameworks';

  console.log('\n📄 Storing document chunks...');

  // Document chunks about ML frameworks
  const documentChunks = [
    {
      content:
        'TensorFlow is an open-source machine learning framework developed by Google. It has a comprehensive ecosystem of tools and libraries that makes it suitable for a wide range of ML tasks.',
      embedding: Array(1536)
        .fill(0)
        .map(() => Math.random() * 2 - 1),
    },
    {
      content:
        'PyTorch is a machine learning framework developed by Facebook. It is known for its ease of use and dynamic computational graph, making it popular among researchers.',
      embedding: Array(1536)
        .fill(0)
        .map(() => Math.random() * 2 - 1),
    },
    {
      content:
        'scikit-learn is a simple and efficient tool for data mining and data analysis. It is built on NumPy, SciPy, and matplotlib, making it accessible for beginners.',
      embedding: Array(1536)
        .fill(0)
        .map(() => Math.random() * 2 - 1),
    },
    {
      content:
        'For beginners, scikit-learn offers the gentlest learning curve with its consistent API and extensive documentation. PyTorch is also beginner-friendly, especially for those interested in deep learning.',
      embedding: Array(1536)
        .fill(0)
        .map(() => Math.random() * 2 - 1),
    },
  ];

  // Store each document chunk
  for (let i = 0; i < documentChunks.length; i++) {
    await contextService.storeDocumentChunk(
      userId,
      documentId,
      'ML Framework Comparison', // Document title
      documentChunks[i].content,
      documentChunks[i].embedding,
      i,
      documentChunks.length,
      {
        category: 'machine-learning',
        source: 'ML Framework Guide',
      },
    );
  }

  // -------------------------------------------------
  // 3. Retrieve relevant context for a new query
  // -------------------------------------------------

  console.log('\n🔍 Retrieving relevant context for new query...');

  // New user query
  const userQuery =
    'Which ML framework has the best documentation for beginners?';

  // In a real application, you would use an embedding model for this
  const queryEmbedding = Array(1536)
    .fill(0)
    .map(() => Math.random() * 2 - 1);

  // Retrieve both conversation history and document chunks relevant to the query
  const relevantContext = await contextService.retrieveRagContext(
    userId,
    queryEmbedding,
    {
      topK: 5,
      minScore: 0.5,
      contextTypes: [ContextType.CONVERSATION, ContextType.DOCUMENT],
      // Optionally filter by specific conversation or document
      // conversationId: conversationId,
      // documentIds: [documentId],
      includeEmbeddings: false,
    },
  );

  console.log(`Found ${relevantContext.length} relevant context items`);

  // Extract the content from each result for use in RAG
  const contextForRAG = relevantContext.map((item: any) => {
    // The content would typically be retrieved from a separate content store
    // or from the metadata in more sophisticated implementations
    return {
      content:
        item.metadata?.contextType === ContextType.CONVERSATION
          ? `${item.metadata?.role}: ${item.metadata?.message || ''}`
          : `Document: ${item.metadata?.content || ''}`,
      score: item.score,
      type: item.metadata?.contextType,
      source: item.metadata?.source,
    };
  });

  console.log('\n📚 Context prepared for RAG:');
  console.log(contextForRAG);

  // -------------------------------------------------
  // 4. Get conversation history
  // -------------------------------------------------

  console.log('\n💬 Retrieving complete conversation history...');

  const conversationHistory = await contextService.getConversationHistory(
    userId,
    conversationId,
  );

  console.log(`Retrieved ${conversationHistory.length} conversation turns`);

  // -------------------------------------------------
  // 5. Get user context statistics
  // -------------------------------------------------

  console.log('\n📊 Getting user context statistics...');

  const stats = await contextService.getUserContextStats(userId);

  console.log(`Total context entries: ${stats.totalContextEntries}`);
  console.log('Context type distribution:', stats.contextTypeCounts);
  console.log('Categories:', stats.categoryCounts);
  console.log('Documents:', Object.keys(stats.documentCounts).length);
  console.log('Conversations:', Object.keys(stats.conversationCounts).length);

  // -------------------------------------------------
  // 6. Clean up (for demonstration purposes)
  // -------------------------------------------------

  console.log('\n🧹 Cleaning up...');

  // Delete the conversation
  const deletedTurns = await contextService.deleteConversation(
    userId,
    conversationId,
  );
  console.log(`Deleted ${deletedTurns} conversation turns`);

  // Delete the document
  const deletedChunks = await contextService.deleteDocument(userId, documentId);
  console.log(`Deleted ${deletedChunks} document chunks`);
}

// Run the example
ragExample().catch((error) => {
  console.error('Error in RAG example:', error);
});
