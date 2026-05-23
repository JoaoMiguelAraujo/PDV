'use client';

import { useCallback, useEffect, useState } from 'react';

interface OdEvent {
    id: number;
    appIdHeader: string;
    merchantIdHeader: string;
    signature: string;
    eventId: string | null;
    eventType: string | null;
    orderId: string | null;
    orderURL: string | null;
    body: string;
    signatureValid: boolean;
    erro: string | null;
    orderDetail: string | null;
    orderDetailStatus: number | null;
    criadoEm: string;
    merchant: { id: number; name: string; merchantId: string } | null;
}

interface Callback {
    id: number;
    type: string;
    triggeredBy: string;
    requestBody: string | null;
    httpStatus: number | null;
    responseBody: string | null;
    erro: string | null;
    criadoEm: string;
    order: { orderId: string; displayId: string | null; merchantId: number };
}

type Tab = 'events' | 'callbacks';

export default function LogsClient() {
    const [tab, setTab] = useState<Tab>('events');
    const [events, setEvents] = useState<OdEvent[]>([]);
    const [callbacks, setCallbacks] = useState<Callback[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [evRes, cbRes] = await Promise.all([
                fetch('/api/events?limit=200', { cache: 'no-store' }),
                fetch('/api/callbacks?limit=200', { cache: 'no-store' }),
            ]);
            const evData = await evRes.json();
            const cbData = await cbRes.json();
            setEvents(evData.events || []);
            setCallbacks(cbData.callbacks || []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center gap-2 mb-4">
                <button
                    onClick={() => setTab('events')}
                    className={`text-sm font-bold px-3 py-2 rounded-lg ${tab === 'events' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-white/5'}`}
                >
                    Eventos recebidos
                    <span className="ml-2 text-[10px] font-black opacity-70">{events.length}</span>
                </button>
                <button
                    onClick={() => setTab('callbacks')}
                    className={`text-sm font-bold px-3 py-2 rounded-lg ${tab === 'callbacks' ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-white/5'}`}
                >
                    Callbacks ao menuGo
                    <span className="ml-2 text-[10px] font-black opacity-70">{callbacks.length}</span>
                </button>
                <button
                    onClick={fetchAll}
                    className="ml-auto text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center gap-1.5"
                >
                    <span className="material-symbols-outlined text-[14px]">refresh</span>
                    Atualizar
                </button>
            </div>

            {loading ? (
                <div className="text-center py-20 text-slate-400 text-sm">Carregando…</div>
            ) : tab === 'events' ? (
                <EventsList events={events} expanded={expanded} setExpanded={setExpanded} />
            ) : (
                <CallbacksList items={callbacks} expanded={expanded} setExpanded={setExpanded} />
            )}
        </div>
    );
}

function EventsList({ events, expanded, setExpanded }: { events: OdEvent[]; expanded: string | null; setExpanded: (k: string | null) => void }) {
    if (events.length === 0) return <EmptyMsg msg="Nenhum evento recebido ainda." />;
    return (
        <div className="space-y-2">
            {events.map(ev => {
                const key = `ev-${ev.id}`;
                const open = expanded === key;
                const sigOk = ev.signatureValid;
                const detailOk = ev.orderDetailStatus === 200;
                return (
                    <article key={ev.id} className={`bg-white dark:bg-slate-900 border rounded-xl overflow-hidden ${sigOk ? 'border-slate-200 dark:border-white/10' : 'border-red-200 dark:border-red-500/30'}`}>
                        <button
                            onClick={() => setExpanded(open ? null : key)}
                            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-white/5"
                        >
                            <span className={`material-symbols-outlined ${sigOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                {sigOk ? 'check_circle' : 'cancel'}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate">
                                    {ev.eventType || '(sem eventType)'} · {ev.merchant?.name || <span className="text-red-500">merchant não cadastrado</span>}
                                </div>
                                <div className="text-[10px] font-mono text-slate-500 truncate">
                                    orderId: {ev.orderId || '—'}
                                </div>
                            </div>
                            <BadgeChip ok={sigOk} label="HMAC" />
                            <BadgeChip ok={detailOk} label="GET" extra={ev.orderDetailStatus?.toString()} />
                            <time className="text-[10px] font-mono text-slate-400 ml-2">{new Date(ev.criadoEm).toLocaleString('pt-BR')}</time>
                            <span className="material-symbols-outlined text-[18px] text-slate-400">{open ? 'expand_less' : 'expand_more'}</span>
                        </button>
                        {open && (
                            <div className="border-t border-slate-100 dark:border-white/5 p-4 bg-slate-50 dark:bg-slate-950 space-y-3">
                                {ev.erro && (
                                    <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 p-2 rounded">
                                        <strong>Erro:</strong> {ev.erro}
                                    </div>
                                )}
                                <Meta rows={[
                                    ['X-App-Id', ev.appIdHeader],
                                    ['X-App-MerchantId', ev.merchantIdHeader],
                                    ['X-App-Signature', ev.signature.slice(0, 20) + '…'],
                                    ['eventId', ev.eventId || '—'],
                                    ['orderURL', ev.orderURL || '—'],
                                ]} />
                                <Code title="Body recebido" raw={ev.body} />
                                {ev.orderDetail && <Code title={`GET orderURL (status ${ev.orderDetailStatus})`} raw={ev.orderDetail} />}
                            </div>
                        )}
                    </article>
                );
            })}
        </div>
    );
}

function CallbacksList({ items, expanded, setExpanded }: { items: Callback[]; expanded: string | null; setExpanded: (k: string | null) => void }) {
    const [retrying, setRetrying] = useState<number | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    async function retry(cb: Callback) {
        setRetrying(cb.id);
        try {
            const r = await fetch(`/api/callbacks/${cb.id}/retry`, { method: 'POST' });
            const d = await r.json().catch(() => ({}));
            setToast(d.ok ? `Retry OK (HTTP ${d.httpStatus})` : `Falha: ${d.erro || d.message || `HTTP ${r.status}`}`);
            setTimeout(() => setToast(null), 4000);
            if (d.ok) setTimeout(() => window.location.reload(), 1200);
        } finally {
            setRetrying(null);
        }
    }

    if (items.length === 0) return <EmptyMsg msg="Nenhum callback emitido ainda." />;
    return (
        <div className="space-y-2">
            {items.map(cb => {
                const key = `cb-${cb.id}`;
                const open = expanded === key;
                const ok = cb.httpStatus != null && cb.httpStatus >= 200 && cb.httpStatus < 300;
                return (
                    <article key={cb.id} className={`bg-white dark:bg-slate-900 border rounded-xl overflow-hidden ${ok ? 'border-slate-200 dark:border-white/10' : 'border-red-200 dark:border-red-500/30'}`}>
                        <button
                            onClick={() => setExpanded(open ? null : key)}
                            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-white/5"
                        >
                            <span className={`material-symbols-outlined ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>sync_alt</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold font-mono truncate">
                                    {cb.type}
                                    <span className="ml-2 text-[10px] font-black opacity-60">[{cb.triggeredBy}]</span>
                                </div>
                                <div className="text-[10px] font-mono text-slate-500 truncate">
                                    pedido #{cb.order.displayId || cb.order.orderId.slice(-12)}
                                </div>
                            </div>
                            <BadgeChip ok={ok} label="HTTP" extra={cb.httpStatus?.toString() || (cb.erro ? 'ERR' : '?')} />
                            {!ok && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); retry(cb); }}
                                    disabled={retrying === cb.id}
                                    className="text-[10px] font-bold px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-300 disabled:opacity-50"
                                    title="Re-executa o callback"
                                >
                                    {retrying === cb.id ? '…' : 'retry'}
                                </button>
                            )}
                            <time className="text-[10px] font-mono text-slate-400 ml-2">{new Date(cb.criadoEm).toLocaleString('pt-BR')}</time>
                            <span className="material-symbols-outlined text-[18px] text-slate-400">{open ? 'expand_less' : 'expand_more'}</span>
                        </button>
                        {open && (
                            <div className="border-t border-slate-100 dark:border-white/5 p-4 bg-slate-50 dark:bg-slate-950 space-y-3">
                                {cb.erro && (
                                    <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 p-2 rounded">
                                        <strong>Erro:</strong> {cb.erro}
                                    </div>
                                )}
                                {cb.requestBody && <Code title="Request body" raw={cb.requestBody} />}
                                {cb.responseBody && <Code title="Response body" raw={cb.responseBody} />}
                            </div>
                        )}
                    </article>
                );
            })}
            {toast && (
                <div className="fixed bottom-6 right-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm px-4 py-3 rounded-lg shadow-2xl font-medium z-50">{toast}</div>
            )}
        </div>
    );
}

function BadgeChip({ ok, label, extra }: { ok: boolean; label: string; extra?: string }) {
    return (
        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded ${ok ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300'}`}>
            {label}{extra ? ` ${extra}` : ''}
        </span>
    );
}

function EmptyMsg({ msg }: { msg: string }) {
    return (
        <div className="text-center py-16 border border-dashed border-slate-200 dark:border-white/10 rounded-2xl">
            <span className="material-symbols-outlined text-[48px] text-slate-300 dark:text-slate-700">inbox</span>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{msg}</p>
        </div>
    );
}

function Meta({ rows }: { rows: Array<[string, string]> }) {
    return (
        <table className="w-full text-[11px] font-mono">
            <tbody>
                {rows.map(([k, v]) => (
                    <tr key={k} className="border-b border-slate-100 dark:border-white/5 last:border-0">
                        <td className="py-1 pr-3 text-slate-500 dark:text-slate-400 align-top">{k}</td>
                        <td className="py-1 break-all">{v}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function Code({ title, raw }: { title: string; raw: string }) {
    let pretty: string;
    try { pretty = JSON.stringify(JSON.parse(raw), null, 2); } catch { pretty = raw; }
    return (
        <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1.5">{title}</div>
            <pre className="text-[11px] font-mono bg-slate-900 dark:bg-black text-slate-100 p-3 rounded-lg overflow-x-auto max-h-80 overflow-y-auto">{pretty}</pre>
        </div>
    );
}
