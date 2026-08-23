export interface DateTimeResolutionResult {
  resolved: boolean;
  originalPhrase: string;
  isoDateTime?: string;
  formattedConfirmation?: string;
  clarificationQuestion?: string;
  timezone: string;
}

export class DateTimeResolver {
  private defaultTimezone = 'Asia/Kolkata';

  /**
   * Resolves natural language callback time phrases into standard ISO datetime strings in Asia/Kolkata (IST).
   * 
   * Configurable Daypart Defaults:
   * - Morning: 10:00 AM (10:00)
   * - Afternoon: 02:00 PM (14:00)
   * - Evening: 06:00 PM (18:00)
   * - After 3 PM: 04:00 PM (16:00)
   */
  public resolve(phrase: string, baseDate: Date = new Date(), timezone: string = this.defaultTimezone): DateTimeResolutionResult {
    const text = phrase.trim().toLowerCase();
    const result: DateTimeResolutionResult = {
      resolved: false,
      originalPhrase: phrase,
      timezone,
    };

    // Calculate reference date in IST (+5.5 hours)
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const now = new Date(baseDate.getTime() + istOffsetMs);
    const targetDate = new Date(now);

    // 1. "Tomorrow Morning"
    if (text.includes('tomorrow morning') || (text.includes('tomorrow') && text.includes('morning'))) {
      targetDate.setDate(targetDate.getDate() + 1);
      targetDate.setHours(10, 0, 0, 0);
      return this.buildResult(phrase, targetDate, 'tomorrow morning at 10:00 AM', timezone);
    }

    // 2. "Tomorrow Evening"
    if (text.includes('tomorrow evening') || (text.includes('tomorrow') && text.includes('evening'))) {
      targetDate.setDate(targetDate.getDate() + 1);
      targetDate.setHours(18, 0, 0, 0);
      return this.buildResult(phrase, targetDate, 'tomorrow evening at 6:00 PM', timezone);
    }

    // 3. "Tomorrow Afternoon"
    if (text.includes('tomorrow afternoon') || (text.includes('tomorrow') && text.includes('afternoon'))) {
      targetDate.setDate(targetDate.getDate() + 1);
      targetDate.setHours(14, 0, 0, 0);
      return this.buildResult(phrase, targetDate, 'tomorrow afternoon at 2:00 PM', timezone);
    }

    // 4. "Monday Afternoon" (or any specific weekday)
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let dayIndex = 0; dayIndex < weekdays.length; dayIndex++) {
      const dayName = weekdays[dayIndex];
      if (text.includes(dayName)) {
        const currentDayIndex = targetDate.getDay();
        let daysToAdd = (dayIndex - currentDayIndex + 7) % 7;
        if (daysToAdd === 0) daysToAdd = 7; // Next occurrence

        targetDate.setDate(targetDate.getDate() + daysToAdd);

        let hour = 14; // Default afternoon
        let timeLabel = 'afternoon at 2:00 PM';
        if (text.includes('morning')) {
          hour = 10;
          timeLabel = 'morning at 10:00 AM';
        } else if (text.includes('evening')) {
          hour = 18;
          timeLabel = 'evening at 6:00 PM';
        }

        targetDate.setHours(hour, 0, 0, 0);
        const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        return this.buildResult(phrase, targetDate, `next ${capitalizedDay} ${timeLabel}`, timezone);
      }
    }

    // 5. "After 3 PM" or "After X PM"
    if (text.includes('after 3 pm') || text.includes('after 3pm') || text.includes('after 3')) {
      if (targetDate.getHours() >= 16) {
        targetDate.setDate(targetDate.getDate() + 1); // Tomorrow if already past 4 PM
      }
      targetDate.setHours(16, 0, 0, 0);
      return this.buildResult(phrase, targetDate, 'today after 3 PM (at 4:00 PM)', timezone);
    }

    // 6. Explicit hour (e.g. "at 4 PM", "at 5:30 PM", "tomorrow at 4 PM")
    const timeMatch = text.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3].toLowerCase();

      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;

      if (text.includes('tomorrow')) {
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (targetDate.getHours() > hour) {
        targetDate.setDate(targetDate.getDate() + 1);
      }

      targetDate.setHours(hour, minutes, 0, 0);
      const displayTime = `${timeMatch[1]}:${minutes.toString().padStart(2, '0')} ${meridiem.toUpperCase()}`;
      return this.buildResult(phrase, targetDate, `at ${displayTime}`, timezone);
    }

    // 7. Vague / Ambiguous phrases requiring clarification
    if (text.includes('later') || text.includes('sometime') || text.includes('next week') || text.includes('other day')) {
      return {
        resolved: false,
        originalPhrase: phrase,
        timezone,
        clarificationQuestion: 'Sure! What specific day and time works best for you for a quick callback?',
      };
    }

    return result;
  }

  private buildResult(phrase: string, date: Date, confirmationText: string, timezone: string): DateTimeResolutionResult {
    // Format ISO string in UTC
    const isoDateTime = date.toISOString();

    return {
      resolved: true,
      originalPhrase: phrase,
      isoDateTime,
      formattedConfirmation: confirmationText,
      timezone,
    };
  }
}

export const dateTimeResolver = new DateTimeResolver();
