export interface BookCallbackParams {
  phoneNumber: string;
  startDateTimeISO: string;
  summary: string;
  description?: string;
}

export interface BookCallbackResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

export interface ICalendarProvider {
  providerName: string;
  resolveDateTime(naturalLanguagePhrase: string, timezone?: string): Promise<string | null>;
  bookCallbackEvent(params: BookCallbackParams): Promise<BookCallbackResult>;
}
