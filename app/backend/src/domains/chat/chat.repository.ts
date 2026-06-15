import postgres from 'postgres';

/**
 * Chat Repository
 * Encapsulates database/vector operations for RAG document chunks.
 */
export class ChatRepository {
  constructor(private readonly db: postgres.Sql) {}
}
