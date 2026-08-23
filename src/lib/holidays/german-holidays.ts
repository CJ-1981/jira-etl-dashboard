/**
 * German Holiday Calendar
 * Supports all 16 German federal states with full and half holidays.
 * Used by the KPI engine to exclude holidays from working hour calculations.
 */

export interface GermanHoliday {
  date: Date;
  name: string;
  nameEn: string;
  isNational: boolean;
  regions: GermanState[]; // empty = national
}

// Federal state codes
export const GERMAN_STATES = {
  NATIONAL: 'national',
  BW: 'BW',     // Baden-Württemberg
  BY: 'BY',     // Bayern
  BE: 'BE',     // Berlin
  BB: 'BB',     // Brandenburg
  HB: 'HB',     // Bremen
  HH: 'HH',     // Hamburg
  HE: 'HE',     // Hessen
  MV: 'MV',     // Mecklenburg-Vorpommern
  NI: 'NI',     // Niedersachsen
  NW: 'NW',     // Nordrhein-Westfalen
  RP: 'RP',     // Rheinland-Pfalz
  SL: 'SL',     // Saarland
  SN: 'SN',     // Sachsen
  ST: 'ST',     // Sachsen-Anhalt
  SH: 'SH',     // Schleswig-Holstein
  TH: 'TH',     // Thüringen
} as const;

export type GermanState = (typeof GERMAN_STATES)[keyof typeof GERMAN_STATES];

/**
 * Calculate Easter Sunday using the Anonymous Gregorian algorithm
 */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Get all German holidays for a given year (memoized)
 * @MX:NOTE: Returns all national and regional holidays for the year
 */
const holidayCache = new Map<string, GermanHoliday[]>();

export function getGermanHolidays(year: number): GermanHoliday[] {
  // @MX:NOTE: Simple per-year cache since regions parameter was removed
  const cacheKey = `${year}`;
  const cached = holidayCache.get(cacheKey);
  if (cached) return cached;

  const easter = getEasterSunday(year);

  const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  // Fixed date helper
  const fixed = (month: number, day: number, name: string, nameEn: string, isNational: boolean, regions: GermanState[] = []): GermanHoliday => ({
    date: new Date(year, month - 1, day),
    name,
    nameEn,
    isNational,
    regions,
  });

  const fromEaster = (offset: number, name: string, nameEn: string, isNational: boolean, regions: GermanState[] = []): GermanHoliday => ({
    date: addDays(easter, offset),
    name,
    nameEn,
    isNational,
    regions,
  });

  const holidays: GermanHoliday[] = [
    // National holidays (all states)
    fixed(1, 1, 'Neujahr', 'New Year\'s Day', true),
    fixed(5, 1, 'Tag der Arbeit', 'Labour Day', true),
    fixed(10, 3, 'Tag der Deutschen Einheit', 'German Unity Day', true),
    fixed(12, 25, 'Erster Weihnachtstag', 'Christmas Day', true),
    fixed(12, 26, 'Zweiter Weihnachtstag', 'Second Christmas Day', true),
    fromEaster(-2, 'Karfreitag', 'Good Friday', true),
    fromEaster(0, 'Ostersonntag', 'Easter Sunday', true),
    fromEaster(1, 'Ostermontag', 'Easter Monday', true),
    fromEaster(39, 'Christi Himmelfahrt', 'Ascension Day', true),
    fromEaster(49, 'Pfingstsonntag', 'Whit Sunday', true),
    fromEaster(50, 'Pfingstmontag', 'Whit Monday', true),

    // Regional holidays
    fixed(1, 6, 'Heilige Drei Könige', 'Epiphany', false, [GERMAN_STATES.BW, GERMAN_STATES.BY, GERMAN_STATES.ST]),
    fixed(8, 15, 'Mariä Himmelfahrt', 'Assumption Day', false, [GERMAN_STATES.SL, GERMAN_STATES.BY]),
    fixed(10, 31, 'Reformationstag', 'Reformation Day', false, [
      GERMAN_STATES.BB, GERMAN_STATES.MV, GERMAN_STATES.SN,
      GERMAN_STATES.ST, GERMAN_STATES.TH, GERMAN_STATES.HB,
      GERMAN_STATES.HH, GERMAN_STATES.NI, GERMAN_STATES.SH,
      GERMAN_STATES.NW, GERMAN_STATES.HE, GERMAN_STATES.RP, GERMAN_STATES.SL,
    ]),
    fixed(11, 1, 'Allerheiligen', 'All Saints\' Day', false, [GERMAN_STATES.BW, GERMAN_STATES.BY, GERMAN_STATES.NW, GERMAN_STATES.RP, GERMAN_STATES.SL]),
    fromEaster(60, 'Fronleichnam', 'Corpus Christi', false, [GERMAN_STATES.BW, GERMAN_STATES.BY, GERMAN_STATES.HE, GERMAN_STATES.NW, GERMAN_STATES.RP, GERMAN_STATES.SL]),
  ];

  // @MX:NOTE: Store in cache with region-aware key
  holidayCache.set(cacheKey, holidays);
  return holidays;
}

/**
 * Pre-compute a Set of holiday date strings (YYYY-MM-DD) for a year range and regions.
 * Used by SLA plugin to avoid per-issue holiday calendar traversal.
 */
export function getHolidayDateSet(
  startYear: number,
  endYear: number,
  regions: GermanState[] = []
): Set<string> {
  const dates = new Set<string>();
  for (let year = startYear; year <= endYear; year++) {
    const holidays = getGermanHolidays(year);
    for (const holiday of holidays) {
      // Include national holidays OR regional holidays that intersect with provided regions
      // When regions is empty, only include national holidays (matches isGermanHoliday semantics)
      if (holiday.isNational || (regions.length > 0 && holiday.regions.some(r => regions.includes(r)))) {
        const y = holiday.date.getFullYear();
        const m = String(holiday.date.getMonth() + 1).padStart(2, '0');
        const d = String(holiday.date.getDate()).padStart(2, '0');
        dates.add(`${y}-${m}-${d}`);
      }
    }
  }
  return dates;
}

/**
 * Check if a date is a German holiday (considering specified states)
 */
export function isGermanHoliday(date: Date, regions: GermanState[] = [GERMAN_STATES.NATIONAL]): GermanHoliday | null {
  const year = date.getFullYear();
  const holidays = getGermanHolidays(year);

  for (const holiday of holidays) {
    const sameDate =
      holiday.date.getFullYear() === date.getFullYear() &&
      holiday.date.getMonth() === date.getMonth() &&
      holiday.date.getDate() === date.getDate();

    if (sameDate) {
      if (holiday.isNational) return holiday;
      if (holiday.regions.some((r) => regions.includes(r))) return holiday;
    }
  }
  return null;
}

/**
 * Check if a date is a working day (Mon-Fri, not a holiday)
 */
export function isWorkingDay(date: Date, regions: GermanState[] = []): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // Saturday or Sunday
  return !isGermanHoliday(date, regions);
}

// @MX:NOTE: Business hours cache to avoid redundant calculations
// Key format: `${startMs}-${endMs}-${regionsKey}-${workStartHour}-${workEndHour}`
const businessHoursCache = new Map<string, number>();
const BUSINESS_HOURS_CACHE_SIZE = 1000;

function getBusinessHoursCacheKey(
  startDate: Date,
  endDate: Date,
  regions: GermanState[],
  workStartHour: number,
  workEndHour: number,
  holidayDateSet?: Set<string>
): string {
  // Copy before sorting to avoid mutating the caller's array
  const regionsKey = regions.length > 0 ? [...regions].sort().join(',') : 'none';
  // Use sorted holiday dates to create a stable, unique cache key
  const holidayKey = holidayDateSet ? `set-${Array.from(holidayDateSet).sort().join(',')}` : 'dynamic';
  return `${startDate.getTime()}-${endDate.getTime()}-${regionsKey}-${workStartHour}-${workEndHour}-${holidayKey}`;
}

/**
 * Calculate business hours between two dates, excluding weekends and German holidays.
 * Default working hours: 09:00-17:00 (8 hours/day), configurable.
 * @MX:NOTE: Optimized with mathematical calculation instead of day-by-day iteration
 * @MX:REASON: O(n) to O(1) for typical date ranges, plus caching for repeated calls
 */
export function calculateBusinessHours(
  startDate: Date,
  endDate: Date,
  options: {
    regions?: GermanState[];
    workStartHour?: number;
    workEndHour?: number;
    workDaysPerWeek?: number[];
    holidayDateSet?: Set<string>;
  } = {}
): number {
  const {
    regions = [],
    workStartHour = 9,
    workEndHour = 17,
    workDaysPerWeek = [1, 2, 3, 4, 5],
    holidayDateSet,
  } = options;

  // Handle edge cases
  if (startDate >= endDate) return 0;

  // Check cache first
  const cacheKey = getBusinessHoursCacheKey(startDate, endDate, regions, workStartHour, workEndHour, holidayDateSet);
  const cached = businessHoursCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const isHoliday = holidayDateSet
    ? (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return holidayDateSet.has(`${y}-${m}-${d}`);
      }
    : (date: Date) => !!isGermanHoliday(date, regions);

  const hoursPerDay = workEndHour - workStartHour;
  let totalMinutes = 0;

  // @MX:NOTE: Optimization - use mathematical calculation for multi-day ranges
  // instead of iterating day-by-day (which was O(n))
  const startDayStart = new Date(startDate);
  startDayStart.setHours(0, 0, 0, 0);

  const endDayStart = new Date(endDate);
  endDayStart.setHours(0, 0, 0, 0);

  const isSameDay = startDayStart.getTime() === endDayStart.getTime();

  if (isSameDay) {
    // Single day calculation
    const dayOfWeek = startDate.getDay();
    if (workDaysPerWeek.includes(dayOfWeek) && !isHoliday(startDate)) {
      const dayStart = new Date(startDate);
      dayStart.setHours(workStartHour, 0, 0, 0);

      const dayEnd = new Date(startDate);
      dayEnd.setHours(workEndHour, 0, 0, 0);

      const effectiveStart = startDate > dayStart ? startDate : dayStart;
      const effectiveEnd = endDate < dayEnd ? endDate : dayEnd;

      if (effectiveStart < effectiveEnd) {
        totalMinutes = (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60);
      }
    }
  } else {
    // Multi-day calculation
    // First day (partial)
    const firstDayEnd = new Date(startDate);
    firstDayEnd.setHours(workEndHour, 0, 0, 0);

    const firstDayStart = new Date(startDate);
    firstDayStart.setHours(workStartHour, 0, 0, 0);

    const firstDayWeekDay = startDate.getDay();
    if (workDaysPerWeek.includes(firstDayWeekDay) && !isHoliday(startDate)) {
      const effectiveStart = startDate > firstDayStart ? startDate : firstDayStart;
      if (effectiveStart < firstDayEnd) {
        totalMinutes += (firstDayEnd.getTime() - effectiveStart.getTime()) / (1000 * 60);
      }
    }

    // Last day (partial)
    const lastDayStart = new Date(endDate);
    lastDayStart.setHours(workStartHour, 0, 0, 0);

    const lastDayEnd = new Date(endDate);
    lastDayEnd.setHours(workEndHour, 0, 0, 0);

    const lastDayWeekDay = endDate.getDay();
    if (workDaysPerWeek.includes(lastDayWeekDay) && !isHoliday(endDate)) {
      const effectiveEnd = endDate < lastDayEnd ? endDate : lastDayEnd;
      if (lastDayStart < effectiveEnd) {
        totalMinutes += (effectiveEnd.getTime() - lastDayStart.getTime()) / (1000 * 60);
      }
    }

    // Middle days (full days - use mathematical approach to avoid day-by-day iteration)
    // @MX:REASON: Both anchors must share the same time-of-day; a noon startDay vs midnight
    // endCheck loses 12h per range, making middleDays one too few (drops a whole middle day).
    const startDay = new Date(startDate);
    startDay.setDate(startDay.getDate() + 1);
    startDay.setHours(0, 0, 0, 0);

    const endCheck = new Date(endDate);
    endCheck.setHours(0, 0, 0, 0);

    const oneDayMs = 24 * 60 * 60 * 1000;
    const middleDays = Math.floor((endCheck.getTime() - startDay.getTime()) / oneDayMs);

    if (middleDays > 7) {
      // Mathematical approach: full weeks * working days, minus holidays
      const startDow = startDay.getDay();
      const firstPartialDays = Math.min(6 - startDow, middleDays); // days before first Sunday
      for (let i = 0; i < firstPartialDays; i++) {
        const checkDate = new Date(startDay);
        checkDate.setDate(checkDate.getDate() + i);
        const dow = checkDate.getDay();
        if (workDaysPerWeek.includes(dow) && !isHoliday(checkDate)) {
          totalMinutes += hoursPerDay * 60;
        }
      }

      const remainingAfterFirst = middleDays - firstPartialDays;
      const fullWeeks = Math.floor(remainingAfterFirst / 7);
      if (fullWeeks > 0) {
        totalMinutes += fullWeeks * workDaysPerWeek.length * hoursPerDay * 60;
        // Subtract holidays in full weeks
        const fullWeekStart = new Date(startDay);
        fullWeekStart.setDate(fullWeekStart.getDate() + firstPartialDays);
        const fullWeekEnd = new Date(fullWeekStart);
        fullWeekEnd.setDate(fullWeekEnd.getDate() + fullWeeks * 7 - 1);

        // Derive holiday set if not provided
        const holidaysToSubtract = holidayDateSet ?? (() => {
          const startYear = fullWeekStart.getFullYear();
          const endYear = fullWeekEnd.getFullYear();
          return getHolidayDateSet(startYear, endYear, regions);
        })();

        // Convert Set to Array for iteration compatibility
        const holidayArray = Array.from(holidaysToSubtract);
        for (const holidayStr of holidayArray) {
          // Parse YYYY-MM-DD as local date to avoid UTC midnight shift
          const [y, m, d] = holidayStr.split('-').map(Number);
          const holidayDate = new Date(y, m - 1, d);
          if (holidayDate >= fullWeekStart && holidayDate <= fullWeekEnd) {
            const dow = holidayDate.getDay();
            if (workDaysPerWeek.includes(dow)) {
              totalMinutes -= hoursPerDay * 60;
            }
          }
        }
      }

      const remainingAfterWeeks = remainingAfterFirst % 7;
      const lastPartialStart = new Date(startDay);
      lastPartialStart.setDate(lastPartialStart.getDate() + firstPartialDays + fullWeeks * 7);
      for (let i = 0; i < remainingAfterWeeks; i++) {
        const checkDate = new Date(lastPartialStart);
        checkDate.setDate(checkDate.getDate() + i);
        const dow = checkDate.getDay();
        if (workDaysPerWeek.includes(dow) && !isHoliday(checkDate)) {
          totalMinutes += hoursPerDay * 60;
        }
      }
    } else {
      // Short range: simple iteration
      const current = new Date(startDay);
      for (let i = 0; i < middleDays; i++) {
        const dayOfWeek = current.getDay();
        if (workDaysPerWeek.includes(dayOfWeek) && !isHoliday(current)) {
          totalMinutes += hoursPerDay * 60;
        }
        current.setDate(current.getDate() + 1);
      }
    }
  }

  const result = Math.round((totalMinutes / 60) * 100) / 100;

  // Cache the result (with LRU eviction)
  if (businessHoursCache.size >= BUSINESS_HOURS_CACHE_SIZE) {
    const firstKey = businessHoursCache.keys().next().value;
    if (firstKey !== undefined) {
      businessHoursCache.delete(firstKey);
    }
  }
  businessHoursCache.set(cacheKey, result);

  return result;
}

// @MX:NOTE: Working days cache
const workingDaysCache = new Map<string, number>();
const WORKING_DAYS_CACHE_SIZE = 500;

function getWorkingDaysCacheKey(
  startDate: Date,
  endDate: Date,
  regions: GermanState[]
): string {
  const regionsKey = regions.length > 0 ? regions.sort().join(',') : 'none';
  return `${startDate.getTime()}-${endDate.getTime()}-${regionsKey}`;
}

/**
 * Calculate calendar days between two dates, excluding weekends and holidays
 * @MX:NOTE: Optimized with mathematical approach and caching
 */
export function calculateWorkingDays(
  startDate: Date,
  endDate: Date,
  regions: GermanState[] = []
): number {
  if (startDate > endDate) return 0;

  // Check cache
  const cacheKey = getWorkingDaysCacheKey(startDate, endDate, regions);
  const cached = workingDaysCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Get holidays in the range for faster lookup
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();
  const holidaySet = getHolidayDateSet(startYear, endYear, regions);

  let days = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  // @MX:NOTE: Optimization - calculate full weeks mathematically, only iterate remaining days
  const oneDay = 24 * 60 * 60 * 1000;
  const diffTime = end.getTime() - current.getTime();
  const diffDays = Math.floor(diffTime / oneDay) + 1;

  if (diffDays > 14) {
    // For longer ranges, use mathematical approach
    const startDayOfWeek = current.getDay(); // 0 = Sunday, 6 = Saturday

    // Count working days in the first partial week
    let firstWeekDays = 0;
    // @MX:REASON: 6 - startDayOfWeek goes negative for Saturday/Sunday starts (dow 6/0
    // would yield 0/-1 misaligning the full-week window and overcounting ~1 day/week).
    // Modulo keeps the partial week ending on Saturday inclusive for any start day.
    const daysUntilSaturday = (6 - startDayOfWeek + 7) % 7;
    const firstWeekEnd = Math.min(daysUntilSaturday + 1, diffDays); // Days until Saturday (inclusive)
    for (let i = 0; i < firstWeekEnd && i < diffDays; i++) {
      const checkDate = new Date(current);
      checkDate.setDate(checkDate.getDate() + i);
      const dow = checkDate.getDay();
      if (dow >= 1 && dow <= 5) { // Monday to Friday
        const y = checkDate.getFullYear();
        const m = String(checkDate.getMonth() + 1).padStart(2, '0');
        const d = String(checkDate.getDate()).padStart(2, '0');
        if (!holidaySet.has(`${y}-${m}-${d}`)) {
          firstWeekDays++;
        }
      }
    }

    // Count full weeks
    const remainingDays = diffDays - firstWeekEnd;
    const fullWeeks = Math.floor(remainingDays / 7);
    const lastPartialWeekDays = remainingDays % 7;

    // Each full week has 5 working days (minus holidays in those weeks)
    let workingDaysInFullWeeks = fullWeeks * 5;

    // Subtract holidays in full weeks (approximate - iterate through known holidays)
    const fullWeekEnd = new Date(current);
    fullWeekEnd.setDate(fullWeekEnd.getDate() + firstWeekEnd + fullWeeks * 7 - 1);
    const holidayArray = Array.from(holidaySet);
    for (const holidayStr of holidayArray) {
      // Parse YYYY-MM-DD as local date to avoid UTC midnight shift
      const [y, m, d] = holidayStr.split('-').map(Number);
      const holidayDate = new Date(y, m - 1, d);
      const checkDate = new Date(current);
      checkDate.setDate(checkDate.getDate() + firstWeekEnd);
      if (holidayDate >= checkDate && holidayDate <= fullWeekEnd) {
        const dow = holidayDate.getDay();
        if (dow >= 1 && dow <= 5) {
          workingDaysInFullWeeks--;
        }
      }
    }

    // Count days in last partial week
    let lastWeekDays = 0;
    const lastWeekStart = new Date(current);
    lastWeekStart.setDate(lastWeekStart.getDate() + firstWeekEnd + fullWeeks * 7);
    for (let i = 0; i < lastPartialWeekDays; i++) {
      const checkDate = new Date(lastWeekStart);
      checkDate.setDate(checkDate.getDate() + i);
      const dow = checkDate.getDay();
      if (dow >= 1 && dow <= 5) {
        const y = checkDate.getFullYear();
        const m = String(checkDate.getMonth() + 1).padStart(2, '0');
        const d = String(checkDate.getDate()).padStart(2, '0');
        if (!holidaySet.has(`${y}-${m}-${d}`)) {
          lastWeekDays++;
        }
      }
    }

    days = firstWeekDays + workingDaysInFullWeeks + lastWeekDays;
  } else {
    // For shorter ranges, use simple iteration
    while (current <= end) {
      const dow = current.getDay();
      if (dow >= 1 && dow <= 5) { // Monday to Friday
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        if (!holidaySet.has(`${y}-${m}-${d}`)) {
          days++;
        }
      }
      current.setDate(current.getDate() + 1);
    }
  }

  // Cache result (with LRU eviction)
  if (workingDaysCache.size >= WORKING_DAYS_CACHE_SIZE) {
    const firstKey = workingDaysCache.keys().next().value;
    if (firstKey !== undefined) {
      workingDaysCache.delete(firstKey);
    }
  }
  workingDaysCache.set(cacheKey, days);

  return days;
}

/**
 * Get holidays for a date range
 */
export function getHolidaysInRange(
  startDate: Date,
  endDate: Date,
  regions: GermanState[] = []
): GermanHoliday[] {
  const holidays: GermanHoliday[] = [];
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  for (let year = startYear; year <= endYear; year++) {
    const yearHolidays = getGermanHolidays(year);
    for (const holiday of yearHolidays) {
      if (holiday.date >= startDate && holiday.date <= endDate) {
        if (holiday.isNational || holiday.regions.some((r) => regions.includes(r))) {
          holidays.push(holiday);
        }
      }
    }
  }

  return holidays.sort((a, b) => a.date.getTime() - b.date.getTime());
}
