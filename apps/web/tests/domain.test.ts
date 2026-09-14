import { describe, it, expect } from 'vitest';
import { attendanceMinutes, shiftWindow, workdays, csvCell, transition } from '../src/server/domain';
describe('HR invariants',()=>{
  it('computes overnight shift in Vietnam and grace without deducting break twice',()=>{
    const shift={start_minute:1320,end_minute:360,break_minutes:60,grace_minutes:5};
    const w=shiftWindow('2026-09-12',shift);
    expect(w.start.toISOString()).toBe('2026-09-12T15:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-09-12T23:00:00.000Z');
    expect(attendanceMinutes(new Date('2026-09-12T15:06:00Z'),new Date('2026-09-12T22:50:00Z'),w,shift)).toEqual({worked_minutes:404,late_minutes:6,early_minutes:10});
  });
  it('counts assigned weekdays and rejects reversed date intervals',()=>{
    expect(workdays('2026-09-11','2026-09-14',[1,2,3,4,5])).toBe(2);
    expect(()=>workdays('2026-09-14','2026-09-11',[1])).toThrow();
  });
  it('does not allow draft approval or locked mutation',()=>{
    expect(()=>transition('DRAFT','approve')).toThrow();
    expect(transition('SUBMITTED','approve')).toBe('APPROVED');
    expect(()=>transition('LOCKED','edit')).toThrow();
  });
  it('escapes CSV injection and quotes',()=>{
    expect(csvCell('=1+1')).toBe('"\'=1+1"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
});
