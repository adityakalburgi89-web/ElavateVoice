# ElevateVoice - Autonomous AI Sales Agent

ElevateVoice is an autonomous, multilingual conversational AI sales agent designed for e-commerce service qualification, real-time mid-call WhatsApp dispatching, natural language callback scheduling, and automated CRM persistence.

---

## Architecture Overview

```
[Customer Phone] <---> [OmniDimension Dialer]
                              |
                     [Fastify Turn Server]
                              |
    +-------------------------+-------------------------+
    |                         |                         |
[Sarvam STT / TTS]   [Gemini / Groq LLM]   [Supabase PostgreSQL]
                              |
                     [Action Guardrails]
                              |
    +-------------------------+-------------------------+
    |                                                   |
[WhatsApp Provider]                           [Google Calendar]
(UltraMsg / Twilio / Meta)                    (IST Daypart Resolver)
```

---

## Quickstart

### 1. Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0

### 2. Installation
```bash
git clone https://github.com/adityakalburgi89-web/ElavateVoice.git
cd ElavateVoice
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and fill in your API credentials:
```bash
cp .env.example .env
```

Key environment variables:
- `OMNIDIMENSION_API_KEY` & `OMNIDIMENSION_AGENT_ID`: Outbound telephony
- `SARVAM_API_KEY`: Speech-to-Text & Text-to-Speech
- `GEMINI_API_KEY`: Primary reasoning LLM (Gemini 2.5 Flash)
- `GROQ_API_KEY`: Secondary fallback LLM (Groq Llama 3.3)
- `WHATSAPP_PROVIDER`: `ultramsg`, `twilio`, or `meta`
- `DATABASE_URL`: Supabase PostgreSQL connection string

### 4. Build & Run
```bash
# Typecheck
npm run typecheck

# Production Build
npm run build

# Start Production Server
npm start

# Start Development Server with Hot Reload
npm run dev
```

---

## Verification & Test Suites

Run automated test suites covering all workflows and 14 failure recovery scenarios:

```bash
# System Hardening (14 Failure Scenarios)
npx tsx scratch/test_system_hardening_failures.ts

# Live Supabase Database Persistence
npx tsx scratch/test_phase9_database_persistence.ts

# Callback Scheduling & IST Daypart Resolver
npx tsx scratch/test_phase7_callback_scheduling.ts

# Post-Call Follow-Up Workflow
npx tsx scratch/test_phase8_postcall_followup.ts
```

---

## Production Deployment

This application is container-ready and can be deployed to any Node.js hosting platform (Railway, Render, AWS EC2, Fly.io, DigitalOcean).

```bash
# Docker / Standalone
npm run build
NODE_ENV=production node dist/index.js
```
