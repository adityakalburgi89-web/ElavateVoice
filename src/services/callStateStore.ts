import { CallState, CallStatus, LeadDetails, TranscriptItem } from '../types/callState.js';

export class CallStateStore {
  private static instance: CallStateStore;
  private calls: Map<string, CallState> = new Map();
  private processedWebhookEvents: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): CallStateStore {
    if (!CallStateStore.instance) {
      CallStateStore.instance = new CallStateStore();
    }
    return CallStateStore.instance;
  }

  public createCall(phoneNumber: string, customCallId?: string): CallState {
    const callId = customCallId || `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const initialLeadDetails: LeadDetails = {
      businessOrProducts: null,
      productCount: null,
      budget: null,
      timeline: null,
      requiredFeatures: [],
      objections: [],
      decisionMaker: null,
    };

    const newState: CallState = {
      callId,
      phoneNumber,
      callStatus: 'initiated',
      detectedLanguage: 'en',
      transcript: [],
      conversationSummary: '',
      leadDetails: initialLeadDetails,
      buyingSignals: [],
      intentScore: 0,
      intentConfidence: 0,
      classification: 'UNCLASSIFIED',
      midCallWhatsApp: {
        sent: false,
        timestamp: null,
        status: null,
        messageId: null,
      },
      callback: {
        requested: false,
        originalPhrase: null,
        resolvedDateTime: null,
        booked: false,
        calendarEventId: null,
      },
      postCallWhatsApp: {
        finalFollowUpSent: false,
        resumeSent: false,
        architectureImageSent: false,
        timestamp: null,
      },
      providerErrors: [],
      createdAt: now,
      updatedAt: now,
    };

    this.calls.set(callId, newState);
    return newState;
  }

  public getCall(callId: string): CallState | null {
    return this.calls.get(callId) || null;
  }

  public getAllCalls(): CallState[] {
    return Array.from(this.calls.values());
  }

  public updateStatus(callId: string, status: CallStatus): CallState | null {
    const call = this.calls.get(callId);
    if (!call) return null;

    call.callStatus = status;
    call.updatedAt = new Date().toISOString();

    // Log status change as system transcript item
    call.transcript.push({
      role: 'system',
      content: `Call status updated to: ${status}`,
      timestamp: call.updatedAt,
    });

    return call;
  }

  public addTranscriptItem(callId: string, item: Omit<TranscriptItem, 'timestamp'>): CallState | null {
    const call = this.calls.get(callId);
    if (!call) return null;

    const fullItem: TranscriptItem = {
      ...item,
      timestamp: new Date().toISOString(),
    };

    call.transcript.push(fullItem);
    call.updatedAt = fullItem.timestamp;
    return call;
  }

  public isWebhookProcessed(eventId: string): boolean {
    return this.processedWebhookEvents.has(eventId);
  }

  public markWebhookProcessed(eventId: string): void {
    this.processedWebhookEvents.add(eventId);
  }
}

export const callStateStore = CallStateStore.getInstance();
