import 'server-only';
import { randomUUID } from 'crypto';

/**
 * Validação e normalização de Service / ServiceHours / ServiceArea fiéis à
 * spec OD v1.7 (docs/openapi.yaml schemas Service 3520, ServiceHours 3797,
 * Hours 3822, TimePeriods 3856, ServiceArea 3655).
 *
 * Não inventar campos: a entrada pode vir parcial (faltando id da ServiceHours,
 * por ex), e normalizamos para um shape OD válido antes de serializar pra JSON
 * no banco.
 */

export const SERVICE_TYPES = ['DELIVERY', 'TAKEOUT', 'INDOOR'] as const;
export const STATUS_VALUES = ['AVAILABLE', 'UNAVAILABLE'] as const;
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
const TIMING_VALUES = ['INSTANT', 'SCHEDULED', 'ONDEMAND'] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];
export type StatusValue = (typeof STATUS_VALUES)[number];

export interface NormalizedServiceHours {
    id: string;
    weekHours: Array<{
        dayOfWeek: string[];
        timePeriods: { startTime: string; endTime: string };
    }>;
    holidayHours?: Array<{
        date: string;
        timePeriods: { startTime: string; endTime: string };
    }>;
}

export interface NormalizedServiceArea {
    id: string;
    polygon?: Array<{
        geoCoordinates: Array<{ latitude: number; longitude: number }>;
    }>;
    geoRadius?: {
        center: { latitude: number; longitude: number };
        radius: number;
    };
}

// Formato esperado pela spec: 'HH:MM:SS.000Z' (linha 3865).
function normalizeTime(t: unknown): string | null {
    if (typeof t !== 'string') return null;
    const s = t.trim();
    // Aceita 'HH:MM' (do <input type="time">), 'HH:MM:SS' ou 'HH:MM:SS.sssZ'.
    let m = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z)?$/.exec(s);
    if (!m) return null;
    const hh = m[1], mm = m[2], ss = m[3] ?? '00';
    return `${hh}:${mm}:${ss}.000Z`;
}

export function normalizeServiceHours(input: unknown): { ok: true; value: NormalizedServiceHours } | { ok: false; error: string } {
    if (!input || typeof input !== 'object') return { ok: false, error: 'serviceHours obrigatório' };
    const obj = input as any;
    const weekHoursIn = Array.isArray(obj.weekHours) ? obj.weekHours : [];
    if (weekHoursIn.length === 0) return { ok: false, error: 'serviceHours.weekHours deve ter ao menos 1 entrada' };

    const weekHours: NormalizedServiceHours['weekHours'] = [];
    for (let i = 0; i < weekHoursIn.length; i++) {
        const w = weekHoursIn[i];
        if (!w || typeof w !== 'object') return { ok: false, error: `weekHours[${i}] inválido` };
        const days = Array.isArray(w.dayOfWeek) ? w.dayOfWeek : [];
        if (days.length === 0) return { ok: false, error: `weekHours[${i}].dayOfWeek vazio` };
        for (const d of days) {
            if (!(DAYS as readonly string[]).includes(d)) return { ok: false, error: `weekHours[${i}].dayOfWeek: '${d}' inválido` };
        }
        const tp = w.timePeriods ?? {};
        const start = normalizeTime(tp.startTime);
        const end = normalizeTime(tp.endTime);
        if (!start || !end) return { ok: false, error: `weekHours[${i}].timePeriods inválido (use HH:MM)` };
        weekHours.push({ dayOfWeek: [...new Set(days)], timePeriods: { startTime: start, endTime: end } });
    }

    const out: NormalizedServiceHours = {
        id: typeof obj.id === 'string' && obj.id ? obj.id : randomUUID(),
        weekHours,
    };

    if (Array.isArray(obj.holidayHours) && obj.holidayHours.length) {
        out.holidayHours = [];
        for (let i = 0; i < obj.holidayHours.length; i++) {
            const h = obj.holidayHours[i];
            if (!h || typeof h !== 'object') return { ok: false, error: `holidayHours[${i}] inválido` };
            if (typeof h.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(h.date)) {
                return { ok: false, error: `holidayHours[${i}].date deve estar em YYYY-MM-DD` };
            }
            const start = normalizeTime(h.timePeriods?.startTime);
            const end = normalizeTime(h.timePeriods?.endTime);
            if (!start || !end) return { ok: false, error: `holidayHours[${i}].timePeriods inválido` };
            out.holidayHours.push({ date: h.date, timePeriods: { startTime: start, endTime: end } });
        }
    }

    return { ok: true, value: out };
}

export function normalizeServiceArea(input: unknown): { ok: true; value: NormalizedServiceArea | null } | { ok: false; error: string } {
    if (input == null) return { ok: true, value: null };
    if (typeof input !== 'object') return { ok: false, error: 'serviceArea inválido' };
    const obj = input as any;
    const out: NormalizedServiceArea = {
        id: typeof obj.id === 'string' && obj.id ? obj.id : randomUUID(),
    };
    if (obj.geoRadius) {
        const c = obj.geoRadius.center ?? {};
        const lat = Number(c.latitude);
        const lng = Number(c.longitude);
        const r = Number(obj.geoRadius.radius);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(r) || r <= 0) {
            return { ok: false, error: 'geoRadius.center.{latitude,longitude} e radius (>0) obrigatórios' };
        }
        out.geoRadius = { center: { latitude: lat, longitude: lng }, radius: r };
    }
    if (Array.isArray(obj.polygon) && obj.polygon.length) {
        out.polygon = [];
        for (let i = 0; i < obj.polygon.length; i++) {
            const p = obj.polygon[i];
            const coords = Array.isArray(p?.geoCoordinates) ? p.geoCoordinates : [];
            if (coords.length < 3) return { ok: false, error: `polygon[${i}].geoCoordinates deve ter ≥3 pontos` };
            out.polygon.push({
                geoCoordinates: coords.map((c: any) => ({
                    latitude: Number(c.latitude),
                    longitude: Number(c.longitude),
                })),
            });
        }
    }
    if (!out.geoRadius && !out.polygon) return { ok: false, error: 'serviceArea precisa de geoRadius ou polygon' };
    return { ok: true, value: out };
}

export function normalizeServiceTiming(input: unknown): { ok: true; value: any | null } | { ok: false; error: string } {
    if (input == null) return { ok: true, value: null };
    if (typeof input !== 'object') return { ok: false, error: 'serviceTiming inválido' };
    const obj = input as any;
    const timing = Array.isArray(obj.timing) ? obj.timing : [];
    for (const t of timing) {
        if (!(TIMING_VALUES as readonly string[]).includes(t)) {
            return { ok: false, error: `serviceTiming.timing: '${t}' inválido` };
        }
    }
    // schedule é complexo (15_MINUTES, 30_MINUTES, ...). Por ora aceitamos como vier.
    return { ok: true, value: timing.length || obj.schedule ? obj : null };
}
