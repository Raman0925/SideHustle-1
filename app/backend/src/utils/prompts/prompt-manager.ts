export interface PromptTemplate {
  name: string;
  version: string;
  template: string;   // template with {{variable}} placeholders
}

export interface RenderOptions {
  variables: Record<string, string>;
  validate?: boolean;  // check all variables are filled
}

export interface PromptManager {
  register(prompt: PromptTemplate): void;
  render(name: string, options: RenderOptions): string;
  getVersion(name: string): string;
  listPrompts(): Array<{ name: string; version: string }>;
}

export function createPromptManager(): PromptManager {
  const prompts = new Map<string, PromptTemplate>();

  /**
   * Registers a prompt template
   */
  function register(prompt: PromptTemplate): void {
    prompts.set(prompt.name, prompt);
  }

  /**
   * Renders a prompt by replacing {{variable}} with values from options.variables.
   * If validate is true, throws an error if any placeholder remains unreplaced.
   */
  function render(name: string, options: RenderOptions): string {
    const prompt = prompts.get(name);
    if (!prompt) {
      throw new Error(`Prompt '${name}' not found`);
    }

    let rendered = prompt.template;
    const { variables, validate } = options;

    // Replace placeholders matching {{variable}} or {{ variable }}
    rendered = rendered.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      if (trimmedKey in variables) {
        return variables[trimmedKey];
      }
      return match;
    });

    if (validate) {
      // Check if any unresolved placeholder remains
      const hasUnresolved = /\{\{\s*([^}]+?)\s*\}\}/.test(rendered);
      if (hasUnresolved) {
        throw new Error(`Validation failed: Missing variables for template '${name}'`);
      }
    }

    return rendered;
  }

  /**
   * Returns current version of a named prompt
   */
  function getVersion(name: string): string {
    const prompt = prompts.get(name);
    if (!prompt) {
      throw new Error(`Prompt '${name}' not found`);
    }
    return prompt.version;
  }

  /**
   * Returns all registered prompts and their versions
   */
  function listPrompts(): Array<{ name: string; version: string }> {
    return Array.from(prompts.values()).map(p => ({
      name: p.name,
      version: p.version
    }));
  }

  return {
    register,
    render,
    getVersion,
    listPrompts
  };
}

/**
 * System prompt for a customer support RAG bot
 */
export const customerSupportSystemPrompt = `You are a helpful and professional customer support assistant for {{companyName}}.
Your task is to answer user queries using the provided sources.

Here are the sources you should use to answer the user's questions:
{{sources}}

Guidelines:
1. Rely ONLY on the clear facts directly mentioned in the sources. Do not assume or extrapolate.
2. If the answer cannot be found in the sources, politely inform the user that you do not know the answer and suggest they contact support at {{supportEmail}}.
3. Be polite, concise, and helpful.

Answer the user's question now:`;
