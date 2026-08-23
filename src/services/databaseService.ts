import pg from 'pg';
import { env } from '../config/env.js';
import { CallState } from '../types/callState.js';

const { Pool } = pg;

export class DatabaseService {
  private pool: pg.Pool | null = null;
  private isConnected: boolean = false;

  constructor() {
    const connectionString = env.DATABASE_URL;
    if (connectionString && !connectionString.includes('dummy')) {
      this.pool = new Pool({
        connectionString,
        ssl: {
          rejectUnauthorized: false,
        },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    }
  }

  /**
   * Initializes PostgreSQL / Supabase tables for ElevateVoice.
   */
  public async initSchema(): Promise<boolean> {
    if (!this.pool) {
      console.log('[DatabaseService] No valid DATABASE_URL configured. Running in in-memory mode.');
      return false;
    }

    try {
      const client = await this.pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS calls (
            call_id TEXT PRIMARY KEY,
            phone_number TEXT NOT NULL,
            call_status TEXT NOT NULL,
            detected_language TEXT,
            classification TEXT,
            confidence NUMERIC,
            intent_score NUMERIC,
            lead_details JSONB,
            qualification JSONB,
            mid_call_whatsapp JSONB,
            post_call_whatsapp JSONB,
            callback JSONB,
            transcript JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS scheduled_callbacks (
            id SERIAL PRIMARY KEY,
            call_id TEXT,
            phone_number TEXT NOT NULL,
            original_phrase TEXT,
            resolved_datetime TIMESTAMPTZ,
            timezone TEXT DEFAULT 'Asia/Kolkata',
            calendar_event_id TEXT,
            booked BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS whatsapp_deliveries (
            id SERIAL PRIMARY KEY,
            call_id TEXT,
            phone_number TEXT NOT NULL,
            message_type TEXT NOT NULL,
            message_id TEXT,
            status TEXT,
            content TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `);
        this.isConnected = true;
        console.log('[DatabaseService] ✅ Connected to Supabase PostgreSQL and initialized schema successfully.');
        return true;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('[DatabaseService] ⚠️ Supabase initialization warning:', err.message);
      return false;
    }
  }

  /**
   * Upserts the canonical CallState to Supabase asynchronously (Non-blocking).
   */
  public async persistCallState(callState: CallState): Promise<boolean> {
    if (!this.pool || !this.isConnected) return false;

    try {
      const query = `
        INSERT INTO calls (
          call_id, phone_number, call_status, detected_language, classification,
          confidence, intent_score, lead_details, qualification, mid_call_whatsapp,
          post_call_whatsapp, callback, transcript, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (call_id) DO UPDATE SET
          call_status = EXCLUDED.call_status,
          detected_language = EXCLUDED.detected_language,
          classification = EXCLUDED.classification,
          confidence = EXCLUDED.confidence,
          intent_score = EXCLUDED.intent_score,
          lead_details = EXCLUDED.lead_details,
          qualification = EXCLUDED.qualification,
          mid_call_whatsapp = EXCLUDED.mid_call_whatsapp,
          post_call_whatsapp = EXCLUDED.post_call_whatsapp,
          callback = EXCLUDED.callback,
          transcript = EXCLUDED.transcript,
          updated_at = NOW();
      `;

      const values = [
        callState.callId,
        callState.phoneNumber,
        callState.callStatus,
        callState.detectedLanguage || 'en',
        callState.qualification?.classification || callState.classification || 'UNCLASSIFIED',
        callState.qualification?.confidence ?? callState.intentConfidence ?? 0,
        callState.qualification?.intentScore ?? callState.intentScore ?? null,
        JSON.stringify(callState.leadDetails || {}),
        JSON.stringify(callState.qualification || {}),
        JSON.stringify(callState.midCallWhatsApp || {}),
        JSON.stringify(callState.postCallWhatsApp || {}),
        JSON.stringify(callState.callback || {}),
        JSON.stringify(callState.transcript || []),
      ];

      await this.pool.query(query, values);
      return true;
    } catch (err: any) {
      console.error(`[DatabaseService] Failed to persist call ${callState.callId}:`, err.message);
      return false;
    }
  }

  /**
   * Persists a booked callback in the database.
   */
  public async recordCallback(callId: string, phoneNumber: string, phrase: string, resolvedDateTime: string, eventId: string): Promise<boolean> {
    if (!this.pool || !this.isConnected) return false;

    try {
      const query = `
        INSERT INTO scheduled_callbacks (call_id, phone_number, original_phrase, resolved_datetime, calendar_event_id, booked)
        VALUES ($1, $2, $3, $4, $5, true);
      `;
      await this.pool.query(query, [callId, phoneNumber, phrase, resolvedDateTime, eventId]);
      return true;
    } catch (err: any) {
      console.error('[DatabaseService] Failed to record callback:', err.message);
      return false;
    }
  }

  /**
   * Closes database pool connection gracefully.
   */
  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

export const databaseService = new DatabaseService();
