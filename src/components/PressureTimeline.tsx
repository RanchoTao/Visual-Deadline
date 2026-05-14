import type { PressureHistoryRecord } from '../types/task';
import { isBurnoutRiskRecord, isRecentPressureRecord, summarizePressureHistory } from '../utils/pressureHistory';

interface PressureTimelineProps {
  records: PressureHistoryRecord[];
}

const eventLabels: Record<NonNullable<PressureHistoryRecord['eventType']>, string> = {
  auto: '自动记录',
  task_created: '新建任务',
  task_completed: '完成任务',
  task_abandoned: '放弃任务',
  recalibration: '重新校准',
  manual: '手动事件',
};

const markerTone: Record<NonNullable<PressureHistoryRecord['eventType']>, string> = {
  auto: 'bg-slate-100 text-slate-500',
  task_created: 'bg-sky-50 text-sky-700',
  task_completed: 'bg-emerald-50 text-emerald-700',
  task_abandoned: 'bg-orange-50 text-orange-700',
  recalibration: 'bg-violet-50 text-violet-700',
  manual: 'bg-slate-100 text-slate-600',
};

function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

function buildPath(points: Array<{ x: number; y: number }>): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function pressureToY(pressure: number, chartHeight: number, maxPressure: number): number {
  const safeMaxPressure = Math.max(100, maxPressure, 1);
  return chartHeight - (Math.min(pressure, safeMaxPressure) / safeMaxPressure) * chartHeight;
}

export function PressureTimeline({ records }: PressureTimelineProps) {
  const recentRecords = records.filter((record) => isRecentPressureRecord(record)).slice(-48);
  const stats = summarizePressureHistory(records);
  const chartWidth = 720;
  const chartHeight = 220;
  const paddingX = 32;
  const maxPressure = Math.max(100, ...recentRecords.map((record) => record.pressure));
  const highPressureY = pressureToY(80, chartHeight, maxPressure);
  const points = recentRecords.map((record, index) => {
    const x = recentRecords.length === 1 ? chartWidth / 2 : paddingX + (index / (recentRecords.length - 1)) * (chartWidth - paddingX * 2);
    return { x, y: pressureToY(record.pressure, chartHeight, maxPressure), record };
  });
  const path = buildPath(points);
  const visibleMarkers = recentRecords
    .filter((record) => record.eventType && record.eventType !== 'auto')
    .slice(-6);
  const now = new Date();
  const spanMs = recentRecords.length > 1 ? now.getTime() - new Date(recentRecords[0].timestamp).getTime() : 0;
  const granularityLabels = [
    { label: '最近分钟', active: spanMs <= 60 * 60 * 1000 },
    { label: '今天', active: spanMs <= 24 * 60 * 60 * 1000 },
    { label: '近 7 天', active: spanMs <= 7 * 24 * 60 * 60 * 1000 },
    { label: '近 30 天', active: spanMs <= 30 * 24 * 60 * 60 * 1000 },
  ];

  return (
    <section className="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-xl shadow-slate-200/60 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">压力曲线</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">个人压力时间线</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">记录压力随时间的变化，帮助你观察节奏，而不是只看此刻。</p>
        </div>
        <div className="flex flex-wrap gap-2">{granularityLabels.map((item) => <span key={item.label} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${item.active ? 'bg-white text-slate-700 ring-slate-200 shadow-sm' : 'bg-slate-50 text-slate-400 ring-white/80'}`}>{item.label}</span>)}</div>
      </div>

      {recentRecords.length < 2 ? (
        <div className="mt-5 flex min-h-56 items-center justify-center rounded-[1.5rem] bg-slate-50/80 p-8 text-center text-sm font-medium text-slate-400 ring-1 ring-white/80">
          继续使用一段时间后，这里会形成你的压力曲线。
        </div>
      ) : (
        <div className="mt-5 rounded-[1.5rem] bg-slate-50/80 p-4 ring-1 ring-white/80">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="压力曲线图" className="h-64 w-full overflow-visible">
            <defs>
              <linearGradient id="pressureLine" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#94a3b8" />
                <stop offset="100%" stopColor="#475569" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width={chartWidth} height={highPressureY} fill="#fee2e2" opacity="0.35" rx="18" />
            <text x="18" y="20" fill="#fb7185" fontSize="12" fontWeight="600">高压区</text>
            {[0, 25, 50, 75, 100].map((tick) => {
              const y = pressureToY(tick, chartHeight, maxPressure);
              return <line key={tick} x1="0" x2={chartWidth} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />;
            })}
            <path d={path} fill="none" stroke="url(#pressureLine)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            {points.map(({ x, y, record }) => {
              const eventType = record.eventType ?? 'auto';
              const isEventMarker = eventType !== 'auto' || isBurnoutRiskRecord(record);
              return <circle key={record.id} cx={x} cy={y} r={isEventMarker ? 5 : 3} fill={isBurnoutRiskRecord(record) ? '#fb7185' : eventType === 'task_completed' ? '#10b981' : eventType === 'task_abandoned' ? '#f97316' : eventType === 'recalibration' ? '#8b5cf6' : '#64748b'} opacity={isEventMarker ? 0.9 : 0.45} />;
            })}
          </svg>
          <div className="mt-2 flex justify-between text-xs text-slate-400">
            <span>{formatTime(recentRecords[0].timestamp)}</span>
            <span>{formatTime(recentRecords[recentRecords.length - 1].timestamp)}</span>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-5">
        <div className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80"><p className="text-xs text-slate-400">当前压力</p><p className="mt-1 text-2xl font-semibold text-slate-950">{stats.currentPressure}</p></div>
        <div className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80"><p className="text-xs text-slate-400">今日最高压力</p><p className="mt-1 text-2xl font-semibold text-slate-950">{stats.todayHighest}</p></div>
        <div className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80"><p className="text-xs text-slate-400">今日最低压力</p><p className="mt-1 text-2xl font-semibold text-slate-950">{stats.todayLowest}</p></div>
        <div className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80"><p className="text-xs text-slate-400">压力波动</p><p className="mt-1 text-2xl font-semibold text-slate-950">{stats.volatility}</p></div>
        <div className="rounded-3xl bg-slate-50/80 p-4 ring-1 ring-white/80"><p className="text-xs text-slate-400">记录数量</p><p className="mt-1 text-2xl font-semibold text-slate-950">{stats.recordCount}</p></div>
      </div>

      {visibleMarkers.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {visibleMarkers.map((record) => {
            const eventType = record.eventType ?? 'auto';
            return <span key={record.id} className={`rounded-full px-3 py-1.5 text-xs font-medium ${markerTone[eventType]}`}>{eventLabels[eventType]} · {formatTime(record.timestamp)}</span>;
          })}
        </div>
      ) : null}
    </section>
  );
}
