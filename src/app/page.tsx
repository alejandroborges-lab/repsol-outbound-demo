'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ParsedCall, DashboardStats, NegotiationResult } from '@/types';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { X, Phone, Clock, TrendingUp, Users, Calendar, PhoneOff, Loader2, ChevronRight, ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatPhone(phone: string): string {
  if (!phone) return '—';
  return phone;
}

function calculateStats(calls: ParsedCall[]): DashboardStats {
  const total = calls.length;
  const escalated = calls.filter((c) => c.outcome === 'escalated').length;
  const qualified = calls.filter((c) => c.outcome === 'qualified' || c.outcome === 'escalated').length;
  const callbacks = calls.filter((c) => c.outcome === 'callback').length;
  const voicemails = calls.filter((c) => c.outcome === 'voicemail').length;
  const closed = calls.filter((c) => c.outcome === 'closed').length;
  const inProgress = calls.filter((c) => c.outcome === 'in_progress').length;
  const conversionRate = total > 0 ? Math.round((escalated / total) * 1000) / 10 : 0;

  const priceNeg = calls.filter((c) => c.negotiationResult);
  const negotiation = {
    aligned: priceNeg.filter((c) => c.negotiationResult === 'aligned').length,
    negotiable: priceNeg.filter((c) => c.negotiationResult === 'negotiable').length,
    outOfMarket: priceNeg.filter((c) => c.negotiationResult === 'out_of_market').length,
  };

  return { total, escalated, qualified, callbacks, voicemails, closed, inProgress, conversionRate, negotiation };
}

// ─── Labels & colors ─────────────────────────────────────────────────────────

const OUTCOME_LABEL: Record<string, string> = {
  escalated: 'Escalado a Comercial',
  qualified: 'Lead Cualificado',
  price_recorded: 'Precio Registrado',
  callback: 'Callback Programado',
  decision_maker: 'Contacto Referido',
  voicemail: 'Buzón de Voz',
  closed: 'Cierre Educado',
  in_progress: 'En Curso',
  unknown: 'Sin Clasificar',
};

const OUTCOME_STYLE: Record<string, string> = {
  escalated: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  qualified: 'bg-blue-50 text-blue-700 border border-blue-200',
  price_recorded: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  callback: 'bg-amber-50 text-amber-700 border border-amber-200',
  decision_maker: 'bg-purple-50 text-purple-700 border border-purple-200',
  voicemail: 'bg-slate-100 text-slate-500 border border-slate-200',
  closed: 'bg-slate-100 text-slate-500 border border-slate-200',
  in_progress: 'bg-blue-50 text-blue-600 border border-blue-200',
  unknown: 'bg-slate-100 text-slate-400 border border-slate-200',
};

const NEGOTIATION_LABEL: Record<NegotiationResult, string> = {
  aligned: 'Alineado',
  negotiable: 'Negociable',
  out_of_market: 'Fuera de Mercado',
};

const NEGOTIATION_COLOR: Record<NegotiationResult, string> = {
  aligned: '#10B981',
  negotiable: '#F59E0B',
  out_of_market: '#EF4444',
};

const CLOSE_REASON_LABEL: Record<string, string> = {
  sin_interes: 'Sin interés',
  sin_consumo_estireno: 'No consume estireno',
  fuera_de_mercado: 'Fuera de mercado',
  no_tiempo: 'Sin tiempo',
  barrera_idioma: 'Barrera de idioma',
  no_decisor: 'No es decisor',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveBadge({ source }: { source: 'live' | 'mock' }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={clsx(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
          source === 'live'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-amber-50 text-amber-700 border border-amber-200',
        )}
      >
        <span
          className={clsx(
            'w-1.5 h-1.5 rounded-full animate-pulse',
            source === 'live' ? 'bg-emerald-500' : 'bg-amber-500',
          )}
        />
        {source === 'live' ? 'En vivo' : 'Demo'}
      </span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  large,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: 'green' | 'blue' | 'amber' | 'orange' | 'gray';
  large?: boolean;
}) {
  const accentBorder: Record<string, string> = {
    green: 'border-t-emerald-500',
    blue: 'border-t-repsol-blue',
    amber: 'border-t-amber-500',
    orange: 'border-t-repsol-orange',
    gray: 'border-t-slate-300',
  };
  const accentIcon: Record<string, string> = {
    green: 'text-emerald-500',
    blue: 'text-repsol-blue',
    amber: 'text-amber-500',
    orange: 'text-repsol-orange',
    gray: 'text-slate-400',
  };
  const border = accent ? accentBorder[accent] : 'border-t-slate-200';
  const iconColor = accent ? accentIcon[accent] : 'text-slate-400';

  return (
    <div className={clsx('bg-white rounded-xl p-5 border border-slate-100 border-t-2 shadow-sm', border)}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <Icon className={clsx('w-4 h-4', iconColor)} />
      </div>
      <p className={clsx('font-bold text-slate-900 mt-2', large ? 'text-4xl' : 'text-3xl')}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function OutcomeBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-slate-600">{label}</span>
        <span className="text-sm font-semibold text-slate-800">
          {count} <span className="text-slate-400 font-normal text-xs">({pct}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function NegotiationDonut({ stats }: { stats: DashboardStats['negotiation'] }) {
  const total = stats.aligned + stats.negotiable + stats.outOfMarket;
  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm">
        Sin datos de negociación
      </div>
    );
  }

  const items = [
    { key: 'aligned' as const, label: 'Alineado', color: '#10B981', value: stats.aligned },
    { key: 'negotiable' as const, label: 'Negociable', color: '#F59E0B', value: stats.negotiable },
    { key: 'out_of_market' as const, label: 'Fuera de mercado', color: '#EF4444', value: stats.outOfMarket },
  ];

  // Build SVG donut
  const cx = 60;
  const cy = 60;
  const r = 48;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  const segments = items.map((item) => {
    const pct = item.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const rotation = offset * 360 - 90;
    offset += pct;
    return { ...item, dash, gap, rotation };
  });

  return (
    <div className="flex items-center gap-6">
      <div className="relative flex-shrink-0">
        <svg width="120" height="120" viewBox="0 0 120 120">
          {segments.map((seg) => (
            <circle
              key={seg.key}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${seg.dash} ${seg.gap}`}
              strokeDashoffset={-(seg.rotation / 360) * circumference + circumference / 4}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          ))}
          <text x={cx} y={cy - 4} textAnchor="middle" className="fill-slate-800" style={{ fontSize: 20, fontWeight: 700 }}>
            {total}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 9 }}>
            con precio
          </text>
        </svg>
      </div>
      <div className="space-y-3 flex-1">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-sm text-slate-600">{item.label}</span>
            </div>
            <span className="text-sm font-semibold text-slate-800">
              {item.value}
              <span className="text-slate-400 font-normal ml-1">
                ({total > 0 ? Math.round((item.value / total) * 100) : 0}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Call Detail Modal ─────────────────────────────────────────────────────────

function CallDetailModal({ call, onClose }: { call: ParsedCall; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {call.companyName || call.phone || 'Llamada sin identificar'}
            </h2>
            {call.contactName && <p className="text-sm text-slate-500 mt-0.5">{call.contactName}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Call meta */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Teléfono</p>
              <p className="text-sm font-medium text-slate-800">{formatPhone(call.phone)}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Duración</p>
              <p className="text-sm font-medium text-slate-800">
                {call.duration ? formatDuration(call.duration) : '—'}
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Fase alcanzada</p>
              <p className="text-sm font-medium text-slate-800">Fase {call.phaseReached}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Resultado</p>
              <span className={clsx('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', OUTCOME_STYLE[call.outcome])}>
                {OUTCOME_LABEL[call.outcome]}
              </span>
            </div>
          </div>

          {/* Negotiation result */}
          {call.negotiationResult && (
            <div
              className="rounded-lg p-4 border"
              style={{
                backgroundColor: `${NEGOTIATION_COLOR[call.negotiationResult]}15`,
                borderColor: `${NEGOTIATION_COLOR[call.negotiationResult]}30`,
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: NEGOTIATION_COLOR[call.negotiationResult] }}>
                Resultado de Negociación
              </p>
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold" style={{ color: NEGOTIATION_COLOR[call.negotiationResult] }}>
                  {NEGOTIATION_LABEL[call.negotiationResult]}
                </p>
                {call.clientPrice && (
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Precio cliente</p>
                    <p className="text-sm font-bold text-slate-700">{call.clientPrice} €/TM</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Close reason */}
          {call.closeReason && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Motivo de cierre</p>
              <p className="text-sm font-medium text-slate-700">
                {CLOSE_REASON_LABEL[call.closeReason] || call.closeReason}
              </p>
            </div>
          )}

          {/* Callback info */}
          {(call.callbackDate || call.callbackTime) && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Callback Programado</p>
              <p className="text-sm font-medium text-amber-800">
                {[call.callbackDate, call.callbackTime].filter(Boolean).join(' — ')}
              </p>
              {call.callbackNotes && <p className="text-xs text-amber-600 mt-1">{call.callbackNotes}</p>}
            </div>
          )}

          {/* Decision maker */}
          {call.decisionMakerName && (
            <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider mb-1">Decisor Identificado</p>
              <p className="text-sm font-medium text-purple-800">{call.decisionMakerName}</p>
            </div>
          )}

          {/* Lead qualification */}
          {(call.purchaseType || call.annualConsumption) && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">Datos del Lead</p>
              <div className="grid grid-cols-2 gap-2">
                {call.purchaseType && (
                  <div>
                    <p className="text-xs text-blue-500">Tipo de compra</p>
                    <p className="text-sm font-medium text-blue-800">{call.purchaseType}</p>
                  </div>
                )}
                {call.annualConsumption && (
                  <div>
                    <p className="text-xs text-blue-500">Consumo anual</p>
                    <p className="text-sm font-medium text-blue-800">{call.annualConsumption}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tools called */}
          {call.toolsCalled.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Herramientas invocadas</p>
              <div className="flex flex-wrap gap-1.5">
                {call.toolsCalled.map((tool, i) => (
                  <span key={i} className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs rounded-lg font-mono">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Timestamp */}
          {call.timestamp && (
            <p className="text-xs text-slate-400 text-right">
              {format(new Date(call.timestamp), "d MMM yyyy, HH:mm", { locale: es })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [calls, setCalls] = useState<ParsedCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [source, setSource] = useState<'live' | 'mock'>('mock');
  const [selectedCall, setSelectedCall] = useState<ParsedCall | null>(null);
  const [tick, setTick] = useState(0);

  const fetchCalls = useCallback(async () => {
    try {
      const res = await fetch('/api/calls');
      const data: { calls: ParsedCall[]; source: 'live' | 'mock' } = await res.json();
      setCalls(data.calls);
      setSource(data.source);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    fetchCalls();
    const interval = parseInt(process.env.NEXT_PUBLIC_REFRESH_INTERVAL || '30000', 10);
    const id = setInterval(fetchCalls, interval);
    return () => clearInterval(id);
  }, [fetchCalls]);

  // Update "X ago" display every 15s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  const stats = calculateStats(calls);
  const recentCalls = [...calls].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const inProgressCalls = calls.filter((c) => c.outcome === 'in_progress');

  return (
    <div className="min-h-screen bg-[#F0F4F8]">
      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-4">
            <Image
              src="/repsol-logo.svg"
              alt="Repsol"
              width={100}
              height={24}
              className="h-8 w-auto"
              priority
            />
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <p className="text-sm font-semibold text-repsol-blue leading-tight">Roberto</p>
              <p className="text-xs text-slate-400 leading-tight">Outbound Sales · Estireno Monómero</p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-3">
            {inProgressCalls.length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full">
                <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                <span className="text-xs font-medium text-blue-600">
                  {inProgressCalls.length} llamada{inProgressCalls.length !== 1 ? 's' : ''} activa
                  {inProgressCalls.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {lastUpdated && (
              <p className="text-xs text-slate-400 hidden sm:block">
                Actualizado{' '}
                {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: es })}
              </p>
            )}
            <LiveBadge source={source} key={tick} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-repsol-blue animate-spin" />
          </div>
        ) : (
          <>
            {/* ── KPI row ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <KpiCard
                label="Llamadas Totales"
                value={stats.total}
                icon={Phone}
                accent="blue"
                sub={stats.inProgress > 0 ? `${stats.inProgress} en curso` : undefined}
              />
              <KpiCard
                label="Escalados Comercial"
                value={stats.escalated}
                icon={ArrowUpRight}
                accent="green"
                sub="mejor resultado"
              />
              <KpiCard
                label="Leads Cualificados"
                value={stats.qualified}
                icon={Users}
                accent="blue"
                sub="fase 4-5 completada"
              />
              <KpiCard
                label="Callbacks"
                value={stats.callbacks}
                icon={Calendar}
                accent="amber"
                sub="seguimiento pendiente"
              />
              <KpiCard
                label="Buzones de Voz"
                value={stats.voicemails}
                icon={PhoneOff}
                accent="gray"
              />
              <KpiCard
                label="Tasa Conversión"
                value={`${stats.conversionRate}%`}
                icon={TrendingUp}
                accent="orange"
                sub="escalados / total"
                large
              />
            </div>

            {/* ── Mid section: Negotiation + Outcomes ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Negotiation */}
              <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">
                  Negociación de Precios
                </h3>
                <NegotiationDonut stats={stats.negotiation} />
              </div>

              {/* Outcomes breakdown */}
              <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">
                  Distribución de Resultados
                </h3>
                <div className="space-y-3.5">
                  <OutcomeBar label="Escalado a Comercial" count={stats.escalated} total={stats.total} color="#10B981" />
                  <OutcomeBar
                    label="Lead Cualificado (fase 4)"
                    count={calls.filter((c) => c.outcome === 'qualified').length}
                    total={stats.total}
                    color="#3B82F6"
                  />
                  <OutcomeBar label="Callback Programado" count={stats.callbacks} total={stats.total} color="#F59E0B" />
                  <OutcomeBar
                    label="Contacto Referido"
                    count={calls.filter((c) => c.outcome === 'decision_maker').length}
                    total={stats.total}
                    color="#8B5CF6"
                  />
                  <OutcomeBar label="Cierre Educado" count={stats.closed} total={stats.total} color="#94A3B8" />
                  <OutcomeBar label="Buzón de Voz" count={stats.voicemails} total={stats.total} color="#CBD5E1" />
                </div>
              </div>
            </div>

            {/* ── Calls table ── */}
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                  Llamadas Recientes
                </h3>
                <span className="text-xs text-slate-400">{calls.length} total</span>
              </div>

              {calls.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">Sin llamadas disponibles</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Empresa / Contacto
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Resultado
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Negociación
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Fase
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Duración
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Hora
                        </th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {recentCalls.map((call, i) => (
                        <tr
                          key={call.id}
                          onClick={() => setSelectedCall(call)}
                          className={clsx(
                            'border-b border-slate-50 cursor-pointer transition-colors hover:bg-slate-50/80',
                            i === 0 && 'animate-fade-in',
                          )}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {call.outcome === 'in_progress' && (
                                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                              )}
                              <div>
                                <p className="text-sm font-semibold text-slate-800 leading-tight">
                                  {call.companyName || '—'}
                                </p>
                                <p className="text-xs text-slate-400 leading-tight">
                                  {call.contactName || formatPhone(call.phone)}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={clsx(
                                'inline-flex px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap',
                                OUTCOME_STYLE[call.outcome],
                              )}
                            >
                              {OUTCOME_LABEL[call.outcome]}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            {call.negotiationResult ? (
                              <span
                                className="text-xs font-semibold"
                                style={{ color: NEGOTIATION_COLOR[call.negotiationResult] }}
                              >
                                {NEGOTIATION_LABEL[call.negotiationResult]}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1.5">
                              {[0, 1, 2, 3, 4, 5].map((phase) => (
                                <div
                                  key={phase}
                                  className={clsx(
                                    'w-2 h-2 rounded-full',
                                    phase <= call.phaseReached ? 'bg-repsol-blue' : 'bg-slate-200',
                                  )}
                                />
                              ))}
                              <span className="text-xs text-slate-400 ml-1">{call.phaseReached}/5</span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1 text-slate-500">
                              <Clock className="w-3.5 h-3.5" />
                              <span className="text-sm">
                                {call.duration ? formatDuration(call.duration) : '—'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-xs text-slate-400">
                              {call.timestamp
                                ? formatDistanceToNow(new Date(call.timestamp), { addSuffix: true, locale: es })
                                : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="text-center pb-4">
              <p className="text-xs text-slate-400">
                Repsol Materials · Agente Roberto · Prospección Estireno Monómero B2B ·{' '}
                {source === 'live' ? (
                  <span className="text-emerald-500 font-medium">datos en tiempo real</span>
                ) : (
                  <span className="text-amber-500 font-medium">modo demo — configura HAPPYROBOT_API_KEY para datos reales</span>
                )}
              </p>
            </div>
          </>
        )}
      </main>

      {/* ── Call detail modal ── */}
      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}
    </div>
  );
}
