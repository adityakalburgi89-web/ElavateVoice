import { CallState, CallStatus, LeadDetails, TranscriptItem } from '../types/callState.js';
import { databaseService } from './databaseService.js';

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
      relevantNotes: null,
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
      isSpeaking: false,
      currentPlaybackId: null,
      interruptedTurns: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.calls.set(callId, newState);
    this.asyncPersist(newState);
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

    this.asyncPersist(call);
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
    this.asyncPersist(call);
    return call;
  }

  private processedUtterances: Set<string> = new Set();

  public isUtteranceProcessed(utterance: string): boolean {
    const key = utterance.trim().toLowerCase();
    return !key || this.processedUtterances.has(key);
  }

  public markUtteranceProcessed(utterance: string): void {
    const key = utterance.trim().toLowerCase();
    if (key) this.processedUtterances.add(key);
  }

  public setSpeaking(callId: string, isSpeaking: boolean, playbackId?: string | null): CallState | null {
    const call = this.calls.get(callId);
    if (!call) return null;
    call.isSpeaking = isSpeaking;
    if (playbackId !== undefined) {
      call.currentPlaybackId = playbackId;
    }
    call.updatedAt = new Date().toISOString();
    return call;
  }

  public interruptCall(callId: string): { interrupted: boolean; callState: CallState | null } {
    const call = this.calls.get(callId);
    if (!call) return { interrupted: false, callState: null };

    const wasSpeaking = call.isSpeaking;
    call.isSpeaking = false;
    call.currentPlaybackId = null;
    call.interruptedTurns += 1;
    call.updatedAt = new Date().toISOString();

    call.transcript.push({
      role: 'system',
      content: 'Caller interrupted AI speech (barge-in event)',
      timestamp: call.updatedAt,
    });

    return { interrupted: wasSpeaking, callState: call };
  }

  public setDetectedLanguage(callId: string, language: any): CallState | null {
    const call = this.calls.get(callId);
    if (!call) return null;
    call.detectedLanguage = language;
    call.updatedAt = new Date().toISOString();
    return call;
  }

  public updateLeadDetails(callId: string, updates: Partial<LeadDetails>): CallState | null {
    const call = this.calls.get(callId);
    if (!call) return null;

    call.leadDetails = {
      businessOrProducts: updates.businessOrProducts !== undefined && updates.businessOrProducts !== null
        ? updates.businessOrProducts
        : call.leadDetails.businessOrProducts,
      productCount: updates.productCount !== undefined && updates.productCount !== null
        ? updates.productCount
        : call.leadDetails.productCount,
      budget: updates.budget !== undefined && updates.budget !== null
        ? updates.budget
        : call.leadDetails.budget,
      timeline: updates.timeline !== undefined && updates.timeline !== null
        ? updates.timeline
        : call.leadDetails.timeline,
      requiredFeatures: Array.from(
        new Set([...call.leadDetails.requiredFeatures, ...(updates.requiredFeatures || [])])
      ),
      objections: Array.from(
        new Set([...call.leadDetails.objections, ...(updates.objections || [])])
      ),
      decisionMaker: updates.decisionMaker !== undefined && updates.decisionMaker !== null
        ? updates.decisionMaker
        : call.leadDetails.decisionMaker,
      relevantNotes: updates.relevantNotes !== undefined && updates.relevantNotes !== null
        ? updates.relevantNotes
        : call.leadDetails.relevantNotes || null,
    };
    call.updatedAt = new Date().toISOString();
    this.asyncPersist(call);
    return call;
  }

  public updateQualification(
    callId: string,
    decision: {
      classification: any;
      confidence: number;
      intentScore: number;
      buyingSignals?: string[];
      reasons?: string[];
      barriers?: string[];
    }
  ): CallState | null {
    const call = this.calls.get(callId);
    if (!call) return null;

    call.classification = decision.classification;
    call.intentConfidence = decision.confidence;
    call.intentScore = decision.intentScore;
    if (decision.buyingSignals && decision.buyingSignals.length > 0) {
      call.buyingSignals = Array.from(new Set([...call.buyingSignals, ...decision.buyingSignals]));
    }
    if (decision.barriers && decision.barriers.length > 0) {
      call.leadDetails.objections = Array.from(
        new Set([...call.leadDetails.objections, ...decision.barriers])
      );
    }
    call.updatedAt = new Date().toISOString();
    this.asyncPersist(call);
    return call;
  }

  public isWebhookProcessed(eventId: string): boolean {
    return this.processedWebhookEvents.has(eventId);
  }

  public markWebhookProcessed(eventId: string): void {
    this.processedWebhookEvents.add(eventId);
  }

  private asyncPersist(state: CallState): Promise<void> {
    setImmediate(async () => {
      try {
        await databaseService.persistCallState(state);
      } catch (err: any) {
        // Silently log; database errors never kill the call
      }
    });
  }
}

export const callStateStore = CallStateStore.getInstance();
