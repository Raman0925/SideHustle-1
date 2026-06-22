import postgres from 'postgres';

/**
 * Chat Repository
 * Encapsulates database/vector operations for RAG document chunks.
 */
export interface ChatRepository {}

export function createChatRepository(db: postgres.Sql): ChatRepository {
  return {};
}
