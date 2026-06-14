import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

function getZodSchemaDescription(schema: z.ZodTypeAny): string {
  const jsonSchema = (zodToJsonSchema as any)(schema);
  return JSON.stringify(jsonSchema, null, 2);
}

function stripMarkdown(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) {
    return match[1].trim();
  }
  return text.trim();
}

export class StructuredExtractor {
  constructor(private readonly apiKey: string) { }

  /**
   * Helper to enrich the system prompt with Zod schema instructions.
   */
  private buildEnrichedSystemPrompt(systemPrompt: string, schemaDescription: string): string {
    return `${systemPrompt}

You MUST return a JSON object that strictly adheres to this schema definition:
${schemaDescription}

Rules:
1. Respond ONLY with a valid JSON object.
2. Do not include any conversational filler, notes, or explanation outside the JSON.
3. Wrap your JSON response inside a markdown code block, i.e.:
\`\`\`json
<your JSON here>
\`\`\``;
  }

  /**
   * Performs the actual Anthropic messages call, response parsing, and validation.
   */
  private async executeExtract<T>(
    schema: z.ZodSchema<T>,
    enrichedSystemPrompt: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{ data?: T; rawText?: string; error?: Error }> {
    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 4096,
          system: enrichedSystemPrompt,
          messages
        })
      });
    } catch (fetchErr: unknown) {
      return { error: fetchErr instanceof Error ? fetchErr : new Error(String(fetchErr)) };
    }

    if (!response.ok) {
      try {
        const errBody = await response.text();
        return { error: new Error(`Anthropic API request failed: ${response.status} ${response.statusText} - ${errBody}`) };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return { error: new Error(`Anthropic API request failed: ${response.status} ${response.statusText} - ${errMsg}`) };
      }
    }

    let data;
    try {
      data = (await response.json()) as {
        content?: Array<{
          type: string;
          text: string;
        }>;
      };
    } catch (jsonErr: unknown) {
      const errMsg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
      return { error: new Error(`Failed to parse Anthropic API response as JSON: ${errMsg}`) };
    }

    const text = data.content?.[0]?.text;
    if (!text) {
      return { error: new Error('Empty response received from Anthropic API') };
    }

    const jsonStr = stripMarkdown(text);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        rawText: text,
        error: new Error(`Failed to parse response as JSON. Original output: ${text}. Error: ${errMsg}`)
      };
    }

    const validationResult = schema.safeParse(parsed);
    if (!validationResult.success) {
      const issues = validationResult.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      return {
        rawText: text,
        error: new Error(`Validation failed: ${issues}`)
      };
    }

    return { data: validationResult.data, rawText: text };
  }

  /**
   * Calls claude-haiku-4-5 to extract structured data matching the zod schema.
   * Strips markdown, parses JSON, validates, and throws descriptive errors on failure.
   */
  public async extract<T>(
    schema: z.ZodSchema<T>,
    systemPrompt: string,
    userInput: string
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key is not defined');
    }

    const schemaDescription = getZodSchemaDescription(schema);
    const enrichedSystemPrompt = this.buildEnrichedSystemPrompt(systemPrompt, schemaDescription);

    const result = await this.executeExtract(schema, enrichedSystemPrompt, [
      { role: 'user', content: userInput }
    ]);

    if (result.error) {
      throw result.error;
    }

    return result.data!;
  }

  /**
   * Calls extract, retries with error feedback on failure using message history.
   */
  public async extractWithRetry<T>(
    schema: z.ZodSchema<T>,
    systemPrompt: string,
    userInput: string,
    maxRetries: number = 3
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key is not defined');
    }

    const schemaDescription = getZodSchemaDescription(schema);
    const enrichedSystemPrompt = this.buildEnrichedSystemPrompt(systemPrompt, schemaDescription);

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: userInput }
    ];

    let attempts = 0;

    while (attempts < maxRetries) {
      const result = await this.executeExtract(schema, enrichedSystemPrompt, messages);

      if (!result.error) {
        return result.data!;
      }

      attempts++;
      if (attempts >= maxRetries) {
        throw new Error(`Failed to extract structured data after ${maxRetries} attempts. Last error: ${result.error.message}`);
      }

      // If we received response text from the model, append it and the error feedback to the messages array.
      if (result.rawText) {
        messages.push({ role: 'assistant', content: result.rawText });
        messages.push({
          role: 'user',
          content: `That response failed validation: ${result.error.message}. Please fix it and output the corrected valid JSON.`
        });
      }
      // For general API or network errors where no response text exists, we retry with the same messages array.
    }

    throw new Error('Unreachable');
  }
}

// Schema 1: Support ticket classification
export const TicketSchema = z.object({
  category: z.array(z.enum(['billing', 'technical', 'account', 'other'])).min(1),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  summary: z.string().max(100),
  requiresHuman: z.boolean(),
});

// Schema 2: Contact extraction  
export const ContactSchema = z.object({
  name: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
});
