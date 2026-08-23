import { describe, it, expect } from 'vitest';
import { parseJqlFieldContext } from '../jql-parser';

describe('parseJqlFieldContext', () => {
  it('returns no field for empty input', () => {
    expect(parseJqlFieldContext('')).toEqual({ field: null, afterInOperator: false });
  });

  it('returns no field while typing a bare field name', () => {
    expect(parseJqlFieldContext('stat')).toEqual({ field: null, afterInOperator: false });
  });

  it('detects the field after = (single and double)', () => {
    expect(parseJqlFieldContext('status =')).toMatchObject({ field: 'status' });
    expect(parseJqlFieldContext('status ==')).toMatchObject({ field: 'status' });
    expect(parseJqlFieldContext('status = ')).toMatchObject({ field: 'status' });
  });

  it('detects the field after !=', () => {
    expect(parseJqlFieldContext('priority !=')).toMatchObject({ field: 'priority' });
  });

  it('detects the field after CONTAINS and NOT CONTAINS', () => {
    expect(parseJqlFieldContext('summary CONTAINS')).toMatchObject({ field: 'summary' });
    expect(parseJqlFieldContext('summary NOT CONTAINS')).toMatchObject({ field: 'summary' });
  });

  it('flags afterInOperator right after IN and NOT IN', () => {
    expect(parseJqlFieldContext('status IN')).toEqual({ field: 'status', afterInOperator: true });
    expect(parseJqlFieldContext('status NOT IN')).toEqual({ field: 'status', afterInOperator: true });
    expect(parseJqlFieldContext('status IN ')).toEqual({ field: 'status', afterInOperator: true });
  });

  it('detects the field inside an unclosed IN list', () => {
    expect(parseJqlFieldContext('status IN (')).toMatchObject({ field: 'status' });
    expect(parseJqlFieldContext('status IN ("Done", ')).toMatchObject({ field: 'status' });
    expect(parseJqlFieldContext('status NOT IN (')).toMatchObject({ field: 'status' });
  });

  it('treats a closed IN list as a completed value', () => {
    expect(parseJqlFieldContext('status IN ("Done")')).toEqual({ field: null, afterInOperator: false });
  });

  it('returns no field after a completed value (expect AND/OR next)', () => {
    expect(parseJqlFieldContext('status = "Done"')).toEqual({ field: null, afterInOperator: false });
  });

  it('detects the new field after a logical operator', () => {
    expect(parseJqlFieldContext('status = "Done" AND priority =')).toMatchObject({ field: 'priority' });
  });

  it('handles nested grouping parentheses without false field context', () => {
    expect(parseJqlFieldContext('(status = "Done"')).toEqual({ field: null, afterInOperator: false });
  });

  it('ignores a trailing partial word after a logical operator', () => {
    expect(parseJqlFieldContext('priority = High AND stat')).toEqual({ field: null, afterInOperator: false });
  });

  it('handles extra whitespace gracefully', () => {
    expect(parseJqlFieldContext('status   =   ')).toMatchObject({ field: 'status' });
  });
});
