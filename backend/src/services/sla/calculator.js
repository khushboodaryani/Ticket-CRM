// backend/src/services/sla/calculator.js
import moment from 'moment-timezone';

/**
 * Enterprise SLA Calculator
 * Handles business hours, split shifts, holidays, and per-customer timezones.
 * Inspired by Zoho/Freshdesk logic.
 */
export class SlaCalculator {
    constructor(pool) {
        this.pool = pool;
    }

    /**
     * Compute the absolute due date for a ticket.
     * @param {string|Date} startTime - The creation or resumption time.
     * @param {number} durationHours - SLA duration in hours.
     * @param {Object} calendar - { id, timezone, businessHours: [], holidays: [] }
     * @returns {moment.Moment} The calculated due date in UTC.
     */
    computeDueDate(startTime, durationHours, calendar) {
        const { timezone, businessHours, holidays } = calendar;
        
        // 1. Convert start time to the destination timezone
        let current = moment.tz(startTime, timezone);
        let remainingMinutes = Math.round(durationHours * 60);

        // 2. Formatting holiday dates for lookup (YYYY-MM-DD)
        const holidaySet = new Set(holidays.map(h => moment(h).format('YYYY-MM-DD')));

        // 3. Main Calculation Loop
        let safetyBreak = 0;
        const MAX_ITERATIONS = 5000; // Prevent infinite loops in case of misconfigured calendars

        while (remainingMinutes > 0 && safetyBreak < MAX_ITERATIONS) {
            safetyBreak++;

            const dateStr = current.format('YYYY-MM-DD');
            const dayOfWeek = current.format('ddd'); // Mon, Tue...

            // Is today a holiday?
            if (holidaySet.has(dateStr)) {
                current.add(1, 'day').startOf('day');
                continue;
            }

            // Find all business windows for today
            const windowsToday = businessHours
                .filter(bh => bh.day_of_week === dayOfWeek)
                .map(bh => ({
                    start: moment.tz(`${dateStr} ${bh.start_time}`, timezone),
                    end: moment.tz(`${dateStr} ${bh.end_time}`, timezone)
                }))
                .sort((a, b) => a.start.unix() - b.start.unix());

            if (windowsToday.length === 0) {
                current.add(1, 'day').startOf('day');
                continue;
            }

            let foundWindow = false;
            for (const window of windowsToday) {
                // If we are past this window, skip
                if (current.isSameOrAfter(window.end)) continue;

                // If we are before this window, jump to window start (User's specific requirement: "next business hour window open")
                if (current.isBefore(window.start)) {
                    current = window.start.clone();
                }

                // We are now inside the window
                const minutesAvailable = window.end.diff(current, 'minutes');
                const workDone = Math.min(remainingMinutes, minutesAvailable);

                current.add(workDone, 'minutes');
                remainingMinutes -= workDone;
                foundWindow = true;

                if (remainingMinutes === 0) break;
            }

            // If no window found for the remaining part of today, jump to start of tomorrow
            if (!foundWindow || (remainingMinutes > 0 && current.isSameOrAfter(windowsToday[windowsToday.length - 1].end))) {
                current.add(1, 'day').startOf('day');
            }
        }

        const SYSTEM_TZ = process.env.TIMEZONE || 'Asia/Kolkata';
        return current.clone().tz(SYSTEM_TZ);
    }
}
