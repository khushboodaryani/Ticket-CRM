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
        let remainingSeconds = Math.round(durationHours * 3600);

        // 2. Formatting holiday dates for lookup (YYYY-MM-DD)
        const holidaySet = new Set(holidays.map(h => moment(h).format('YYYY-MM-DD')));

        // 3. Main Calculation Loop
        let safetyBreak = 0;
        const MAX_ITERATIONS = 2000; 

        while (remainingSeconds > 0 && safetyBreak < MAX_ITERATIONS) {
            safetyBreak++;

            const dateStr = current.format('YYYY-MM-DD');
            const dayOfWeek = current.format('ddd');

            if (holidaySet.has(dateStr)) {
                current.add(1, 'day').startOf('day');
                continue;
            }

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

            let foundWindowForToday = false;
            for (const window of windowsToday) {
                if (current.isSameOrAfter(window.end)) continue;
                
                if (current.isBefore(window.start)) {
                    current = window.start.clone();
                }

                const secondsAvailable = window.end.diff(current, 'seconds');
                if (secondsAvailable <= 0) continue;

                const workDone = Math.min(remainingSeconds, secondsAvailable);
                current.add(workDone, 'seconds');
                remainingSeconds -= workDone;
                foundWindowForToday = true;

                if (remainingSeconds <= 0) break;
            }

            // If we are deep into the end of the day or no windows were eligible, hop to tomorrow
            if (remainingSeconds > 0) {
                current.add(1, 'day').startOf('day');
            }
        }

        const SYSTEM_TZ = process.env.TIMEZONE || 'Asia/Kolkata';
        return current.clone().tz(SYSTEM_TZ);
    }
}
