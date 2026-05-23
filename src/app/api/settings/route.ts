import { NextResponse } from 'next/server';
import { getSettings, setSetting, SETTING_KEYS } from '@/lib/settings';
import { withAuth, badRequest } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
    const s = await getSettings();
    return NextResponse.json({ settings: s });
});

export const PATCH = withAuth(async (req: Request) => {
    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    const updates: Array<[string, string]> = [];
    if (body.autoMode !== undefined) updates.push([SETTING_KEYS.AUTO_MODE, body.autoMode ? '1' : '0']);
    if (body.autoConfirmDelayMs !== undefined) updates.push([SETTING_KEYS.AUTO_CONFIRM_DELAY_MS, String(body.autoConfirmDelayMs)]);
    if (body.autoPreparingDelayMs !== undefined) updates.push([SETTING_KEYS.AUTO_PREPARING_DELAY_MS, String(body.autoPreparingDelayMs)]);
    if (body.autoDeliveredDelayMs !== undefined) updates.push([SETTING_KEYS.AUTO_DELIVERED_DELAY_MS, String(body.autoDeliveredDelayMs)]);
    if (body.payOnConfirm !== undefined) updates.push([SETTING_KEYS.PAY_ON_CONFIRM, body.payOnConfirm ? '1' : '0']);

    for (const [k, v] of updates) await setSetting(k, v);
    const next = await getSettings();
    return NextResponse.json({ ok: true, settings: next });
});
