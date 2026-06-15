import { z } from 'zod';

const MessageRoleSchema = z.enum(['user', 'assistant', 'system']);
const MessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string()
});

export const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  history: z.array(MessageSchema).default([]),
  tier: z.enum(['fast', 'balanced', 'powerful']).default('balanced')
});
