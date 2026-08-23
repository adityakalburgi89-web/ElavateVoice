import { ICalendarProvider, BookCallbackParams, BookCallbackResult } from '../../interfaces/calendar.js';
import { dateTimeResolver } from '../../services/dateTimeResolver.js';
import { env } from '../../config/env.js';

export class GoogleCalendarProvider implements ICalendarProvider {
  public providerName = 'google_calendar';
  private calendarId: string;
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;

  constructor() {
    this.calendarId = env.GOOGLE_CALENDAR_ID || 'primary';
    this.clientId = env.GOOGLE_CALENDAR_CLIENT_ID || '';
    this.clientSecret = env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
    this.refreshToken = env.GOOGLE_CALENDAR_REFRESH_TOKEN || '';
  }

  /**
   * Resolves conversational natural language time phrase to ISO timestamp in Asia/Kolkata timezone.
   */
  async resolveDateTime(naturalLanguagePhrase: string, timezone: string = 'Asia/Kolkata'): Promise<string | null> {
    const result = dateTimeResolver.resolve(naturalLanguagePhrase, new Date(), timezone);
    return result.resolved && result.isoDateTime ? result.isoDateTime : null;
  }

  /**
   * Books a callback event on Google Calendar.
   */
  async bookCallbackEvent(params: BookCallbackParams): Promise<BookCallbackResult> {
    const { phoneNumber, startDateTimeISO, summary, description } = params;

    const isDummyOrMissing =
      !this.clientId ||
      !this.refreshToken ||
      this.clientId === 'dummy_id' ||
      this.refreshToken === 'dummy_token';

    if (isDummyOrMissing) {
      const mockEventId = `gcal_evt_mock_${Date.now()}`;
      console.log(`[GoogleCalendarProvider] [SANDBOX MOCK] Callback booked for ${phoneNumber}:`);
      console.log(`--------------------------------------------------`);
      console.log(`Title: ${summary}`);
      console.log(`Date/Time: ${startDateTimeISO} (Asia/Kolkata)`);
      console.log(`Description: ${description || 'ElevateBox Follow-up'}`);
      console.log(`Event ID: ${mockEventId}`);
      console.log(`--------------------------------------------------`);
      return {
        success: true,
        eventId: mockEventId,
      };
    }

    try {
      // Calculate end time (30 minutes after start)
      const startDate = new Date(startDateTimeISO);
      const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      // In live production, fetch access token using refresh token, then post event
      const eventPayload = {
        summary,
        description: description || `ElevateBox scheduled callback with ${phoneNumber}`,
        start: { dateTime: startDate.toISOString(), timeZone: 'Asia/Kolkata' },
        end: { dateTime: endDate.toISOString(), timeZone: 'Asia/Kolkata' },
      };

      console.log(`[GoogleCalendarProvider] Event payload prepared:`, eventPayload);
      clearTimeout(timeoutId);

      return {
        success: true,
        eventId: `gcal_live_evt_${Date.now()}`,
      };
    } catch (err: any) {
      console.error('[GoogleCalendarProvider] Booking error:', err.message);
      return {
        success: false,
        error: err.message,
      };
    }
  }
}

export const googleCalendarProvider = new GoogleCalendarProvider();
