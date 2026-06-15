import { Message } from '../../utils/tokens/types.js';

export { Message };

export interface ChatCompletionResponse {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}
