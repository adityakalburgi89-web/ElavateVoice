import { callStateStore } from './callStateStore.js';
import { dateTimeResolver } from './dateTimeResolver.js';
import { googleCalendarProvider } from '../providers/calendar/googleCalendarProvider.js';
import { databaseService } from './databaseService.js';

export interface CallbackScheduleResult {
  detected: boolean;
  booked: boolean;
  clarificationRequired: boolean;
  clarificationPrompt?: string;
  confirmationMessage?: string;
  originalPhrase?: string;
  resolvedDateTime?: string;
  calendarEventId?: string;
}

export class CallbackSchedulerService {
  /**
   * Detects callback requests in user speech, resolves date/time, books a calendar event,
   * updates CallState, and returns spoken confirmation.
   */
  async processCallbackRequest(callId: string, speechText: string): Promise<CallbackScheduleResult> {
    const text = speechText.trim().toLowerCase();
    const callState = callStateStore.getCall(callId);

    // 1. Detect if speech contains callback request
    const callbackKeywords = [
      'call me',
      'call back',
      'callback',
      'call him',
      'call her',
      'talk later',
      'call tomorrow',
      'after 3 pm',
      'after 3pm',
      'monday afternoon',
      'tomorrow morning',
      'tomorrow evening',
      'call later',
      'busy right now',
    ];

    const hasCallbackIntent = callbackKeywords.some((kw) => text.includes(kw));
    if (!hasCallbackIntent) {
      return { detected: false, booked: false, clarificationRequired: false };
    }

    // 2. Prevent duplicate booking
    if (callState && callState.callback.booked) {
      console.log(`[CallbackSchedulerService] Callback already booked for ${callState.phoneNumber}`);
      return {
        detected: true,
        booked: true,
        clarificationRequired: false,
        confirmationMessage: `We already have a callback booked for you for ${callState.callback.originalPhrase || 'our scheduled time'}.`,
        originalPhrase: callState.callback.originalPhrase || undefined,
        resolvedDateTime: callState.callback.resolvedDateTime || undefined,
        calendarEventId: callState.callback.calendarEventId || undefined,
      };
    }

    // 3. Resolve Date/Time in Asia/Kolkata
    const resolution = dateTimeResolver.resolve(speechText, new Date(), 'Asia/Kolkata');

    if (!resolution.resolved) {
      // Ambiguous: Ask one natural clarification
      if (callState) {
        callState.callback.requested = true;
        callState.callback.originalPhrase = speechText;
        callState.updatedAt = new Date().toISOString();
      }

      return {
        detected: true,
        booked: false,
        clarificationRequired: true,
        clarificationPrompt: resolution.clarificationQuestion || 'Sure, what specific day and time works best for you for a quick callback?',
        originalPhrase: speechText,
      };
    }

    // 4. Book Event in Google Calendar
    const phoneNumber = callState?.phoneNumber || 'Customer';
    const business = callState?.leadDetails.businessOrProducts || 'E-Commerce Website Project';

    const bookingResult = await googleCalendarProvider.bookCallbackEvent({
      phoneNumber,
      startDateTimeISO: resolution.isoDateTime!,
      summary: `ElevateBox Callback: ${phoneNumber} (${business})`,
      description: `Customer requested callback for e-commerce website development.\nOriginal request: "${speechText}"\nResolved IST time: ${resolution.formattedConfirmation}`,
    });

    const confirmationText = `Perfect! I've scheduled a callback for you for ${resolution.formattedConfirmation}. Our team will call you then.`;

    // 5. Persist in canonical CallState
    if (callState) {
      callState.callback = {
        requested: true,
        originalPhrase: speechText,
        resolvedDateTime: resolution.isoDateTime || null,
        timezone: 'Asia/Kolkata',
        booked: bookingResult.success,
        calendarEventId: bookingResult.eventId || null,
      };
      callState.updatedAt = new Date().toISOString();

      callStateStore.addTranscriptItem(callId, {
        role: 'system',
        content: `Callback booked on Google Calendar for ${resolution.formattedConfirmation} (Event ID: ${bookingResult.eventId})`,
      });

      // Record in Supabase database asynchronously
      setImmediate(async () => {
        try {
          await databaseService.recordCallback(
            callId,
            phoneNumber,
            speechText,
            resolution.isoDateTime!,
            bookingResult.eventId || 'unknown'
          );
        } catch (err: any) {
          // Never block call
        }
      });
    }

    console.log(`[CallbackSchedulerService] Callback booked successfully for ${phoneNumber} at ${resolution.isoDateTime}`);

    return {
      detected: true,
      booked: bookingResult.success,
      clarificationRequired: false,
      confirmationMessage: confirmationText,
      originalPhrase: speechText,
      resolvedDateTime: resolution.isoDateTime,
      calendarEventId: bookingResult.eventId,
    };
  }
}

export const callbackSchedulerService = new CallbackSchedulerService();
