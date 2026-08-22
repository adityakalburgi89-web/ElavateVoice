import { LeadDetails } from '../types/callState.js';

export interface SendMidCallWhatsAppParams {
  recipientPhoneNumber: string;
  leadDetails: Partial<LeadDetails>;
  customNote?: string;
}

export interface SendPostCallFollowUpParams {
  recipientPhoneNumber: string;
  conversationSummary: string;
  developerPhoneNumber: string;
  resumeUrl?: string;
  architectureImageUrl?: string;
}

export interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface IWhatsAppProvider {
  providerName: string;
  sendMidCallMessage(params: SendMidCallWhatsAppParams): Promise<WhatsAppResult>;
  sendPostCallFollowUp(params: SendPostCallFollowUpParams): Promise<WhatsAppResult>;
}
