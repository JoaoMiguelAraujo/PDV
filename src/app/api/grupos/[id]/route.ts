import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

export const PATCH = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    const data: any = {};
    if (body.nome !== undefined) {
        if (String(body.nome).trim() === '') return badRequest('nome não pode ser vazio');
        data.nome = String(body.nome).trim();
    }
    if (body.min !== undefined && Number.isFinite(Number(body.min))) data.min = Number(body.min);
    if (body.max !== undefined && Number.isFinite(Number(body.max))) data.max = Number(body.max);
    if (data.min !== undefined && data.max !== undefined && data.max < data.min) {
        return badRequest('max deve ser ≥ min');
    }
    if (body.obrigatorio !== undefined) data.obrigatorio = !!body.obrigatorio;
    if (body.ordem !== undefined && Number.isFinite(Number(body.ordem))) data.ordem = Number(body.ordem);

    try {
        await prisma.grupoModificador.update({ where: { id }, data });
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return notFound('grupo não existe');
        throw err;
    }
});

export const DELETE = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    try {
        await prisma.grupoModificador.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return notFound('grupo não existe');
        throw err;
    }
});
