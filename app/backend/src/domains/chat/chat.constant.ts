import { contextBudget } from '../../utils/tokens/types.js';

export const DEFAULT_CHAT_BUDGET: contextBudget = {
  systemPrompt: 2000,
  toolDefinitions: 0,
  retrievedDocuments: 4000,
  conversationHistory: 8000,
  userMessage: 2000,
  responseBudget: 4000
};

export const DEFAULT_COMPANY_NAME = 'Acme Corp';
export const DEFAULT_SUPPORT_EMAIL = 'support@acme.com';
