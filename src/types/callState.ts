export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'connected'
  | 'completed'
  | 'failed'
  | 'busy'
  | 'no-answer';

import { z } from 'zod';

export type Language = 'en' | 'hi' | 'te' | 'mixed';

export type LeadClassification = 'HOT' | 'WARM' | 'COLD' | 'UNCLASSIFIED';

export const leadDetailsSchema = z.object({
  businessOrProducts: z.string().nullable().optional(),
  productCount: z.number().nullable().optional(),
  budget: z.string().nullable().optional(),
  timeline: z.string().nullable().optional(),
  requiredFeatures: z.array(z.string()).optional().default([]),
  objections: z.array(z.string()).optional().default([]),
  decisionMaker: z.string().nullable().optional(),
  relevantNotes: z.string().nullable().optional(),
});

export const qualificationDecisionSchema = z.object({
  classification: z.enum(['HOT', 'WARM', 'COLD', 'UNCLASSIFIED']),
  confidence: z.number().min(0).max(1),
  intentScore: z.number().min(0).max(100),
  reasons: z.array(z.string()).optional().default([]),
  buyingSignals: z.array(z.string()).optional().default([]),
  barriers: z.array(z.string()).optional().default([]),
  recommendedAction: z.enum([
    'send_mid_call_whatsapp',
    'schedule_callback',
    'continue_conversation',
    'graceful_exit',
  ]),
});

export type QualificationDecision = z.infer<typeof qualificationDecisionSchema>;

export type ExtractedLeadDetails = z.infer<typeof leadDetailsSchema>;

export interface LeadDetails {
  businessOrProducts: string | null;
  productCount: number | null;
  budget: string | null;
  timeline: string | null;
  requiredFeatures: string[];
  objections: string[];
  decisionMaker: string | null;
  relevantNotes?: string | null;
}

export interface MidCallWhatsAppState {
  sent: boolean;
  timestamp: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | null;
  messageId: string | null;
}

export interface CallbackState {
  requested: boolean;
  originalPhrase: string | null;
  resolvedDateTime: string | null;
  timezone?: string | null;
  booked: boolean;
  calendarEventId: string | null;
}

export interface PostCallWhatsAppState {
  finalFollowUpSent: boolean;
  resumeSent: boolean;
  architectureImageSent: boolean;
  timestamp: string | null;
  messageId?: string | null;
  followUpText?: string | null;
}

export interface ProviderErrorLog {
  provider: string;
  error: string;
  timestamp: string;
}

export interface TranscriptItem {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  language?: Language;
}

export interface CallState {
  callId: string;
  phoneNumber: string;
  callStatus: CallStatus;
  detectedLanguage: Language;
  transcript: TranscriptItem[];
  conversationSummary: string;
  leadDetails: LeadDetails;
  buyingSignals: string[];
  intentScore: number;
  intentConfidence: number;
  classification: LeadClassification;
  midCallWhatsApp: MidCallWhatsAppState;
  callback: CallbackState;
  postCallWhatsApp: PostCallWhatsAppState;
  providerErrors: ProviderErrorLog[];
  isSpeaking: boolean;
  currentPlaybackId: string | null;
  interruptedTurns: number;
  createdAt: string;
  updatedAt: string;
}

export interface LLMTurnOutput {
  replyText: string;
  detectedLanguage: Language;
  extractedFields: Partial<LeadDetails>;
  buyingSignals: string[];
  classification: LeadClassification;
  confidence: number;
  nextAction: 'continue_conversation' | 'send_mid_call_whatsapp' | 'book_callback' | 'end_call';
  sendMidCallWhatsApp: boolean;
  scheduleCallback: boolean;
  callbackPhrase: string | null;
}

export interface TurnLatencyMetrics {
  sttMs: number;
  llmMs: number;
  ttsMs: number;
  totalMs: number;
}
