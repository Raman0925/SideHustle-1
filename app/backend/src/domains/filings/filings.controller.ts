import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import {
  getRecentFilings,
  getMaterialFilings,
  getFilingById,
  getTodayStats,
  runPollCycle,
  filingsService,
} from './filings.service.js';

// ─── Filings Controller ───────────────────────────────────────────────────────
// Follows exact same pattern as chat.controller.ts:
//   - FastifyInstance plugin
//   - Swagger schema on every route
//   - Thin controller — no business logic here

const filingsController = async (fastify: FastifyInstance, options: FastifyPluginOptions) => {

  // GET /filings/recent — last N filings (all tiers)
  fastify.get(
    '/recent',
    {
      schema: {
        tags: ['Filings'],
        summary: 'Get recent filings',
        description: 'Returns the most recent filings from NSE and BSE, all tiers.',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: { limit?: number } }>, reply: FastifyReply) => {
      const limit = request.query.limit ?? 50;
      const filings = await getRecentFilings(limit);
      return reply.code(200).send({ filings, count: filings.length });
    }
  );

  // GET /filings/material — only MATERIAL filings with LLM summaries
  fastify.get(
    '/material',
    {
      schema: {
        tags: ['Filings'],
        summary: 'Get material filings',
        description: 'Returns only MATERIAL filings that have LLM-generated summaries.',
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: { limit?: number } }>, reply: FastifyReply) => {
      const limit = request.query.limit ?? 20;
      const filings = await getMaterialFilings(limit);
      return reply.code(200).send({ filings, count: filings.length });
    }
  );

  // GET /filings/:id — single filing with summary
  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['Filings'],
        summary: 'Get filing by ID',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const filing = await getFilingById(request.params.id);
      if (!filing) return reply.code(404).send({ error: 'Filing not found' });
      return reply.code(200).send(filing);
    }
  );

  // GET /filings/stats/today — today's filing counts + cost
  fastify.get(
    '/stats/today',
    {
      schema: {
        tags: ['Filings'],
        summary: "Today's filing stats",
        description: 'Returns filing counts by tier and total LLM cost for today.',
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const stats = await getTodayStats();
      return reply.code(200).send(stats);
    }
  );

  // GET /filings/health — poller status
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['Filings'],
        summary: 'Poller health check',
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const status = filingsService.getPollingStatus();
      return reply.code(200).send({
        ...status,
        timestamp: new Date().toISOString(),
      });
    }
  );

  // POST /filings/poll — manually trigger a poll cycle (useful for testing)
  fastify.post(
    '/poll',
    {
      schema: {
        tags: ['Filings'],
        summary: 'Trigger manual poll',
        description: 'Manually trigger one NSE + BSE poll cycle. Useful for testing.',
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await runPollCycle();
      return reply.code(200).send({
        message: 'Poll cycle complete',
        newFilings: result,
      });
    }
  );
};

export default filingsController;
