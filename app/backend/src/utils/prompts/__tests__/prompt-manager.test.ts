import { describe, it, expect, beforeEach } from 'vitest';
import { PromptManager, createPromptManager, customerSupportSystemPrompt } from '../prompt-manager.js';

describe('PromptManager', () => {
  let manager: PromptManager;

  beforeEach(() => {
    manager = createPromptManager();
  });

  it('render correctly replaces variables', () => {
    manager.register({
      name: 'welcome',
      version: '1.0.0',
      template: 'Hello {{name}}! Welcome to {{place}}.'
    });

    const result = manager.render('welcome', {
      variables: {
        name: 'Alice',
        place: 'Wonderland'
      }
    });

    expect(result).toBe('Hello Alice! Welcome to Wonderland.');
  });

  it('render throws when validate=true and a variable is missing', () => {
    manager.register({
      name: 'greet',
      version: '1.1.0',
      template: 'Hello {{firstName}} {{lastName}}!'
    });

    // validate=false or undefined should not throw
    const partialResult = manager.render('greet', {
      variables: {
        firstName: 'Bob'
      }
    });
    expect(partialResult).toBe('Hello Bob {{lastName}}!');

    // validate=true should throw if variables are missing
    expect(() => {
      manager.render('greet', {
        variables: {
          firstName: 'Bob'
        },
        validate: true
      });
    }).toThrowError(/Validation failed: Missing variables/);
  });

  it('listPrompts returns all registered prompts', () => {
    manager.register({
      name: 'promptA',
      version: '1.0.0',
      template: 'Template A'
    });

    manager.register({
      name: 'promptB',
      version: '2.0.0',
      template: 'Template B'
    });

    const list = manager.listPrompts();
    expect(list).toHaveLength(2);
    expect(list).toContainEqual({ name: 'promptA', version: '1.0.0' });
    expect(list).toContainEqual({ name: 'promptB', version: '2.0.0' });
  });

  it('correctly handles customerSupportSystemPrompt template', () => {
    manager.register({
      name: 'customer-support',
      version: '1.0.0',
      template: customerSupportSystemPrompt
    });

    const rendered = manager.render('customer-support', {
      variables: {
        companyName: 'Acme Corp',
        sources: '- Source A: Refund policy is 30 days.\n- Source B: Shipping is free.',
        supportEmail: 'support@acme.com'
      },
      validate: true
    });

    expect(rendered).toContain('Acme Corp');
    expect(rendered).toContain('Refund policy is 30 days');
    expect(rendered).toContain('support@acme.com');
  });
});
