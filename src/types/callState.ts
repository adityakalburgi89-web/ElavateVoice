export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'connected'
  | 'completed'
  | 'failed'
  | 'busy'
  | 'no-answer';

export type Language = 'en' | 'hi' | 'te' | 'mixed';

export type LeadClassification = 'HOT' | 'WARM' | 'COLD' | 'UNCLASSIFIED';

export interface LeadDetails {
  businessOrProducts: string | null;
  productCount: number | null;
  budget: string | null;
  timeline: string | null;
  requiredFeatures: string[];
  objections: string[];
  decisionMaker: string | null;
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
  booked: boolean;
  calendarEventId: string | null;
}

export interface PostCallWhatsAppState {
  finalFollowUpSent: boolean;
  resumeSent: boolean;
  architectureImageSent: boolean;
  timestamp: string | null;
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
