'use client';

import { useEffect, useState } from 'react';

interface Settings {
    autoMode: boolean;
    autoConfirmDelayMs: number;
    autoPreparingDelayMs: number;
    autoDeliveredDelayMs: number;
    payOnConfirm: boolean;
}

export default function SettingsClient() {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };

    async function load() {
        const res = await fetch('/api/settings', { cache: 'no-store' });
        const data = await res.json();
        setSettings(data.settings);
    }

    useEffect(() => { load(); }, []);

    async function save(patch: Partial<Settings>) {
        setSaving(true);
        try {
            const res = await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            const data = await res.json();
            if (data.settings) setSettings(data.settings);
            showToast('Salvo.');
        } finally {
            setSaving(false);
        }
    }

    if (!settings) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-20 text-center text-slate-400 text-sm">
                Carregando…
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            <header>
                <h1 className="text-xl font-black">Configurações</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Estes valores sobrescrevem os defaults vindos do <code>.env</code>.
                </p>
            </header>

            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
                <h2 className="font-black mb-1">Modo automático</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    Quando ligado, todo pedido CREATED dispara automaticamente confirm → preparing → delivered.
                    Útil para testes de carga e validação ponta a ponta sem precisar clicar no KDS.
                </p>
                <label className="flex items-center gap-2 text-sm cursor-pointer mb-4">
                    <input
                        type="checkbox"
                        checked={settings.autoMode}
                        onChange={e => save({ autoMode: e.target.checked })}
                        disabled={saving}
                        className="accent-primary"
                    />
                    <span className="font-bold">{settings.autoMode ? 'Ativado' : 'Desativado'}</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <DelayInput
                        label="confirm (ms)"
                        value={settings.autoConfirmDelayMs}
                        onSave={v => save({ autoConfirmDelayMs: v })}
                    />
                    <DelayInput
                        label="preparing (ms)"
                        value={settings.autoPreparingDelayMs}
                        onSave={v => save({ autoPreparingDelayMs: v })}
                    />
                    <DelayInput
                        label="delivered (ms)"
                        value={settings.autoDeliveredDelayMs}
                        onSave={v => save({ autoDeliveredDelayMs: v })}
                    />
                </div>
            </section>

            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
                <h2 className="font-black mb-1">Pagamento na confirmação</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    Quando ligado, o PDV inclui o header <code>X-Mock-Payments: PREPAID</code> no <code>/confirm</code>,
                    sinalizando ao menuGo que o pedido foi pago no PDV. Extensão proprietária do menuGo, não da spec OD.
                </p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                        type="checkbox"
                        checked={settings.payOnConfirm}
                        onChange={e => save({ payOnConfirm: e.target.checked })}
                        disabled={saving}
                        className="accent-primary"
                    />
                    <span className="font-bold">{settings.payOnConfirm ? 'Marcar como PREPAID' : 'Não enviar X-Mock-Payments'}</span>
                </label>
            </section>

            {toast && (
                <div className="fixed bottom-6 right-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm px-4 py-3 rounded-lg shadow-2xl font-medium z-50">
                    {toast}
                </div>
            )}
        </div>
    );
}

function DelayInput({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
    const [local, setLocal] = useState(String(value));
    useEffect(() => { setLocal(String(value)); }, [value]);
    return (
        <label className="block">
            <span className="block text-xs font-bold mb-1">{label}</span>
            <input
                type="number"
                min={0}
                value={local}
                onChange={e => setLocal(e.target.value)}
                onBlur={() => {
                    const n = parseInt(local, 10);
                    if (Number.isFinite(n) && n !== value) onSave(n);
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
            />
        </label>
    );
}
