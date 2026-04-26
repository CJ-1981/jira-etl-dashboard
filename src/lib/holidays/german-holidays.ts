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
 * Get all German holidays for a given year
 */
export function getGermanHolidays(year: number): GermanHoliday[] {
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

  return [
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

/**
 * Calculate business hours between two dates, excluding weekends and German holidays.
 * Default working hours: 09:00-17:00 (8 hours/day), configurable.
 */
export function calculateBusinessHours(
  startDate: Date,
  endDate: Date,
  options: {
    regions?: GermanState[];
    workStartHour?: number;
    workEndHour?: number;
    workDaysPerWeek?: number[];
  } = {}
): number {
  const {
    regions = [],
    workStartHour = 9,
    workEndHour = 17,
    workDaysPerWeek = [1, 2, 3, 4, 5], // Mon-Fri
  } = options;

  const hoursPerDay = workEndHour - workStartHour;
  let totalMinutes = 0;

  const current = new Date(startDate);

  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    if (workDaysPerWeek.includes(dayOfWeek) && !isGermanHoliday(current, regions)) {
      // Calculate overlapping hours on this working day
      const dayStart = new Date(current);
      dayStart.setHours(workStartHour, 0, 0, 0);

      const dayEnd = new Date(current);
      dayEnd.setHours(workEndHour, 0, 0, 0);

      const effectiveStart = startDate > dayStart ? startDate : dayStart;
      const effectiveEnd = endDate < dayEnd ? endDate : dayEnd;

      if (effectiveStart < effectiveEnd) {
        const diffMs = effectiveEnd.getTime() - effectiveStart.getTime();
        totalMinutes += diffMs / (1000 * 60);
      }
    }
    // Move to start of next day
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  return Math.round((totalMinutes / 60) * 100) / 100;
}

/**
 * Calculate calendar days between two dates, excluding weekends and holidays
 */
export function calculateWorkingDays(
  startDate: Date,
  endDate: Date,
  regions: GermanState[] = []
): number {
  let days = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    if (isWorkingDay(current, regions)) {
      days++;
    }
    current.setDate(current.getDate() + 1);
  }

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
