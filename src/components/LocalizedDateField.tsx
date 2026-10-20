import { CalendarDays, Clock3 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type DateMode = 'date' | 'datetime-local';
type Props = { mode: DateMode; value?: string; onChange: (value: string) => void; className?: string; id?: string; disabled?: boolean; required?: boolean; 'aria-label'?: string };
function normalize(input: string, mode: DateMode): string | undefined {
  const text = input.trim().replaceAll('/', '-').replace('T', ' ');
  const match = (mode === 'date'
    ? /^(\d{4})-(\d{1,2})-(\d{1,2})$/
    : /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/).exec(text);
  if (!match) return;
  const [, year, month, day, hour = '0', minute = '0'] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const check = new Date(0); check.setFullYear(y, m - 1, d);
  if (y < 1900 || y > 2200 || check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d || Number(hour) > 23 || Number(minute) > 59) return;
  const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return mode === 'date' ? date : `${date}T${hour.padStart(2, '0')}:${minute}`;
}
const visible = (value: string, mode: DateMode) => mode === 'date' ? value.slice(0, 10) : value.slice(0, 16).replace('T', ' ');
/** Browser-independent readable dates; the hidden native picker is only for calendar selection. */
export function LocalizedDateField({ mode, value = '', onChange, className = '', id, disabled, required, 'aria-label': label }: Props) {
  const [draft, setDraft] = useState(() => visible(value, mode));
  const [invalid, setInvalid] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { setDraft(visible(value, mode)); setInvalid(false); }, [value, mode]);
  const dateTime = mode === 'datetime-local';
  const placeholder = dateTime ? '选择日期时间（年-月-日 时:分）' : '选择日期（年-月-日）';
  const pattern = dateTime ? '[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}' : '[0-9]{4}-[0-9]{2}-[0-9]{2}';
  return <span className="relative block min-w-0">
    <input id={id} aria-label={label ?? placeholder} type="text" inputMode="numeric" required={required} disabled={disabled}
      value={draft} placeholder={placeholder} aria-invalid={invalid || undefined} pattern={pattern}
      className={`${className} w-full min-w-0 pr-12`}
      onChange={(event) => {
        const next = event.target.value; setDraft(next);
        if (!next.trim()) { onChange(''); setInvalid(false); return; }
        const parsed = normalize(next, mode);
        if (parsed) { onChange(parsed); setInvalid(false); }
        else setInvalid(false);
      }}
      onBlur={() => setInvalid(Boolean(draft.trim() && !normalize(draft, mode)))}
    />
    <button type="button" aria-label={dateTime ? '打开日期时间选择器' : '打开日期选择器'} disabled={disabled}
      className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
      onClick={() => { try { picker.current?.showPicker(); } catch { picker.current?.focus(); picker.current?.click(); } }}>
      {dateTime ? <Clock3 className="h-4 w-4" aria-hidden="true" /> : <CalendarDays className="h-4 w-4" aria-hidden="true" />}
    </button>
    <input ref={picker} type={mode} value={value} disabled={disabled} tabIndex={-1} aria-hidden="true"
      onChange={(e) => { onChange(e.target.value); setDraft(visible(e.target.value, mode)); setInvalid(false); }}
      className="vd-native-date-picker pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0" />
    {invalid ? <span role="alert" className="mt-1 block text-xs text-rose-700">{dateTime ? '请输入有效日期时间，例如 2026-10-21 09:00' : '请输入有效日期，例如 2026-10-21'}</span> : null}
  </span>;
}
