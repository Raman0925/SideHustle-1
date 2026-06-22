-- ─── Filings Domain Schema ────────────────────────────────────────────────────
-- Run this migration against your Postgres DB (same DB as the rest of the app)
-- Requires pgvector extension for embedding-based semantic dedup + search

-- Enable pgvector (already enabled if you built the RAG pipeline)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Core filings table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS filings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exchange        TEXT NOT NULL CHECK (exchange IN ('NSE', 'BSE')),
  symbol          TEXT NOT NULL,
  company_name    TEXT NOT NULL,
  filing_type     TEXT NOT NULL,
  subject         TEXT NOT NULL,
  filed_at        TIMESTAMPTZ NOT NULL,
  tier            TEXT NOT NULL CHECK (tier IN ('MATERIAL', 'WATCH', 'ROUTINE')),
  pdf_url         TEXT NOT NULL DEFAULT '',
  is_duplicate    BOOLEAN NOT NULL DEFAULT FALSE,
  duplicate_of    UUID REFERENCES filings(id),
  content_hash    TEXT NOT NULL UNIQUE,   -- prevents exact re-insertion
  raw_payload     JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookups for dashboard queries
CREATE INDEX IF NOT EXISTS idx_filings_tier        ON filings(tier);
CREATE INDEX IF NOT EXISTS idx_filings_symbol      ON filings(symbol);
CREATE INDEX IF NOT EXISTS idx_filings_filed_at    ON filings(filed_at DESC);
CREATE INDEX IF NOT EXISTS idx_filings_exchange    ON filings(exchange);
CREATE INDEX IF NOT EXISTS idx_filings_created_at  ON filings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_filings_hash        ON filings(content_hash);

-- ─── LLM summaries table (only MATERIAL filings) ───────────────────────────────
CREATE TABLE IF NOT EXISTS filing_summaries (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filing_id           UUID NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  headline            TEXT NOT NULL,
  category            TEXT NOT NULL,
  materiality_score   INTEGER NOT NULL CHECK (materiality_score BETWEEN 1 AND 10),
  impact_direction    TEXT NOT NULL CHECK (impact_direction IN ('POSITIVE', 'NEGATIVE', 'NEUTRAL', 'UNCLEAR')),
  key_entities        TEXT[] NOT NULL DEFAULT '{}',
  why_it_matters      TEXT NOT NULL,
  estimated_deal_size TEXT,
  tokens_used         INTEGER NOT NULL DEFAULT 0,
  cost_usd            NUMERIC(10, 6) NOT NULL DEFAULT 0,
  model_used          TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(filing_id)   -- one summary per filing
);

CREATE INDEX IF NOT EXISTS idx_filing_summaries_filing_id    ON filing_summaries(filing_id);
CREATE INDEX IF NOT EXISTS idx_filing_summaries_materiality  ON filing_summaries(materiality_score DESC);
CREATE INDEX IF NOT EXISTS idx_filing_summaries_category     ON filing_summaries(category);

-- ─── Embeddings table (for semantic dedup + similarity search) ─────────────────
-- 1536 dimensions = text-embedding-3-small (OpenAI) — same as your RAG pipeline
CREATE TABLE IF NOT EXISTS filing_embeddings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filing_id   UUID NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  embedding   VECTOR(1536) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(filing_id)
);

-- IVFFlat index for fast approximate nearest neighbour search
-- lists=100 is appropriate for up to ~1M rows; tune if you scale beyond that
CREATE INDEX IF NOT EXISTS idx_filing_embeddings_vector
  ON filing_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
