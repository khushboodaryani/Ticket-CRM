// backend/src/services/sla/__tests__/calculator.test.js
import { SlaCalculator } from '../calculator.js';
import moment from 'moment-timezone';

describe('SlaCalculator', () => {
    let calculator;
    const mockCalendar = {
        timezone: 'Asia/Kolkata',
        businessHours: [
            { day_of_week: 'Mon', start_time: '09:00:00', end_time: '18:00:00' },
            { day_of_week: 'Tue', start_time: '09:00:00', end_time: '18:00:00' },
            { day_of_week: 'Wed', start_time: '09:00:00', end_time: '18:00:00' },
            { day_of_week: 'Thu', start_time: '09:00:00', end_time: '18:00:00' },
            { day_of_week: 'Fri', start_time: '09:00:00', end_time: '18:00:00' },
        ],
        holidays: ['2026-04-20'] // Case: Next Monday is a holiday
    };

    beforeEach(() => {
        calculator = new SlaCalculator(null); // Pool not needed for pure logic
    });

    test('should jump to next business opening if created at night (11 PM)', () => {
        // Thursday night 11 PM
        const startTime = '2026-04-16T23:00:00Z'; 
        const durationHours = 4;
        
        const dueDate = calculator.computeDueDate(startTime, durationHours, mockCalendar);
        
        // Expected Logic: 
        // 1. Created Thu 23:00 UTC (Fri 04:30 IST)
        // 2. Not in business time. Jump to Fri 09:00 IST.
        // 3. Add 4 hours -> Fri 13:00 IST.
        // 4. Fri 13:00 IST = Fri 07:30 UTC.
        
        expect(moment.utc(dueDate).format('YYYY-MM-DD HH:mm')).toBe('2026-04-17 07:30');
    });

    test('should handle weekend crossovers correctly', () => {
        // Friday afternoon 4 PM (16:00 IST)
        const startTime = '2026-04-17T10:30:00Z'; 
        const durationHours = 5;
        
        const dueDate = calculator.computeDueDate(startTime, durationHours, mockCalendar);
        
        // Expected Logic:
        // 1. Start Fri 16:00 IST.
        // 2. Fri ends at 18:00. (2 hours consumed). 3 left.
        // 3. Weekend (Sat/Sun) is skipped.
        // 4. Mon Apr 20 is a holiday. Skip.
        // 5. Tue Apr 21 09:00 IST starts.
        // 6. Add remaining 3 hours -> Tue 12:00 IST.
        // 7. Tue 12:00 IST = Tue 06:30 UTC.
        
        expect(moment.utc(dueDate).format('YYYY-MM-DD HH:mm')).toBe('2026-04-21 06:30');
    });

    test('should handle split shifts correctly', () => {
        const splitCalendar = {
            timezone: 'Asia/Kolkata',
            businessHours: [
                { day_of_week: 'Mon', start_time: '09:00:00', end_time: '13:00:00' },
                { day_of_week: 'Mon', start_time: '14:00:00', end_time: '18:00:00' },
            ],
            holidays: []
        };

        // Monday 12:30 PM (half hour before lunch)
        const startTime = '2026-04-20T07:00:00Z'; 
        const durationHours = 2;

        const dueDate = calculator.computeDueDate(startTime, durationHours, splitCalendar);

        // Expected Logic:
        // 1. Start Mon 12:30 IST.
        // 2. Consume 30 mins until 13:00. (90 mins left).
        // 3. Jump over lunch to 14:00 IST.
        // 4. Consume 90 mins -> 15:30 IST.
        // 5. 15:30 IST = 10:00 UTC.

        expect(moment.utc(dueDate).format('YYYY-MM-DD HH:mm')).toBe('2026-04-20 10:00');
    });
});
