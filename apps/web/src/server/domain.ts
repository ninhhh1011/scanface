export class AppError extends Error {
  constructor(public code:string, public status=400, message=code) {super(message);}
}
export type ShiftRule={start_minute:number;end_minute:number;break_minutes:number;grace_minutes:number};
export function day(value:Date|string=new Date()):string {
  return new Date(new Date(value).getTime()+7*3600_000).toISOString().slice(0,10);
}
export function shiftWindow(date:string,shift:ShiftRule){
  const start=new Date(`${date}T00:00:00+07:00`);
  start.setUTCMinutes(start.getUTCMinutes()+shift.start_minute);
  const duration=(shift.end_minute-shift.start_minute+1440)%1440||1440;
  return {start,end:new Date(start.getTime()+duration*60_000)};
}
export function attendanceMinutes(checkIn:Date,checkOut:Date|null,window:{start:Date;end:Date},shift:ShiftRule){
  const late=Math.max(0,Math.floor((checkIn.getTime()-window.start.getTime())/60_000));
  return {worked_minutes:checkOut?Math.max(0,Math.floor((Math.min(checkOut.getTime(),window.end.getTime())-Math.max(checkIn.getTime(),window.start.getTime()))/60_000)-shift.break_minutes):0,late_minutes:late>shift.grace_minutes?late:0,early_minutes:checkOut?Math.max(0,Math.floor((window.end.getTime()-checkOut.getTime())/60_000)):0};
}
export function workdays(from:string,to:string,weekdays:number[]){
  const start=new Date(from.slice(0,10)+'T00:00:00Z'),end=new Date(to.slice(0,10)+'T00:00:00Z');
  if (!Number.isFinite(+start)||!Number.isFinite(+end)||end<start||+end-+start>366*86400_000) throw new AppError('INVALID_DATE_RANGE');
  let count=0;
  for(let date=+start;date<=+end;date+=86400_000){if(weekdays.includes(new Date(date).getUTCDay()||7)) count++;}
  return count;
}
const transitions:Record<string,Record<string,string>>={DRAFT:{submit:'SUBMITTED',review:'REVIEW',cancel:'CANCELLED'},SUBMITTED:{approve:'APPROVED',reject:'REJECTED',cancel:'CANCELLED'},APPROVED:{cancel:'CANCELLED'},REVIEW:{lock:'LOCKED'},LOCKED:{reopen:'DRAFT'}};
export function transition(status:string,action:string){const next=transitions[status]?.[action];if(!next)throw new AppError('INVALID_TRANSITION',409);return next;}
export function csvCell(value:unknown){let v=String(value??'');if(/^[\s]*[=+@\-\t\r]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';}
