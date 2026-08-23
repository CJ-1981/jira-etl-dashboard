import { NextResponse } from 'next/server';
import { getGermanHolidays, getHolidaysInRange, GERMAN_STATES, type GermanState } from '@/lib/holidays/german-holidays';
import { handleApiError } from '@/lib/api-error';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());
    const region = searchParams.get('region') || 'national';
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    let allHolidays;

    if (start && end) {
      const regions: GermanState[] = region === 'all'
        ? Object.values(GERMAN_STATES)
        : [region as GermanState];
      allHolidays = getHolidaysInRange(new Date(start), new Date(end), regions);
    } else {
      allHolidays = getGermanHolidays(year);
    }

    // Filter holidays based on selected region
    const filteredHolidays = allHolidays.filter((h) => {
      // National holidays always show
      if (h.isNational) return true;

      // Regional holidays: show only if selected region is in the holiday's regions
      // Or if 'all' is selected (show all regional holidays)
      if (region === 'all') return true;

      // Check if the selected region is in this holiday's regions
      return h.regions.includes(region as GermanState);
    });

    return NextResponse.json({
      success: true,
      year,
      region,
      holidays: filteredHolidays.map((h) => ({
        date: h.date.toLocaleDateString('en-CA'), // en-CA gives YYYY-MM-DD format in local timezone
        name: h.nameEn,
        nameLocal: h.name,
        isNational: h.isNational,
        regions: h.regions,
      })),
      states: Object.entries(GERMAN_STATES).map(([key, value]) => ({ key, code: value })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
