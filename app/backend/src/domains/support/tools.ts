import { ToolHandler } from '../../utils/ai/tool-runner.js';

// Tool 1: Look up order status
export const getOrderStatus: ToolHandler<{ orderId: string }, { orderId: string; status: string; eta: string }> = {
  definition: {
    name: 'getOrderStatus',
    description: 'Look up the status and estimated arrival date of an order by its ID.',
    input_schema: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'The unique ID of the order.'
        }
      },
      required: ['orderId']
    }
  },
  handler: async (input) => {
    return { orderId: input.orderId, status: 'shipped', eta: '2024-01-15' };
  }
};

// Tool 2: Get customer account info
export const getCustomerAccount: ToolHandler<{ email: string }, { email: string; plan: string; since: string }> = {
  definition: {
    name: 'getCustomerAccount',
    description: 'Get information about a customer account using their email address.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'The email address of the customer.'
        }
      },
      required: ['email']
    }
  },
  handler: async (input) => {
    return { email: input.email, plan: 'pro', since: '2023-01-01' };
  }
};

// Tool 3: Create support ticket
export const createSupportTicket: ToolHandler<
  { email: string; issue: string; priority: string },
  { ticketId: string; status: string }
> = {
  definition: {
    name: 'createSupportTicket',
    description: 'Create a new support ticket for a customer issue.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'The email address of the customer reporting the issue.'
        },
        issue: {
          type: 'string',
          description: 'A description of the issue.'
        },
        priority: {
          type: 'string',
          description: 'The priority of the ticket (e.g. low, medium, high, urgent).'
        }
      },
      required: ['email', 'issue', 'priority']
    }
  },
  handler: async (input) => {
    // Generate a consistent but unique ticket ID for tests/production
    return { ticketId: `TKT-${Date.now()}`, status: 'created' };
  }
};
