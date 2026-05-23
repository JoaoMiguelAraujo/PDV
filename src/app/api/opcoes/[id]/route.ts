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
    if (body.precoAdicional !== undefined) {
        const n = Number(body.precoAdicional);
        if (!Number.isFinite(n)) return badRequest('precoAdicional inválido');
        data.precoAdicional = n;
    }
    if (body.sku !== undefined) data.sku = body.sku ? String(body.sku).trim() : null;
    if (body.codigoExterno !== undefined) data.codigoExterno = body.codigoExterno ? String(body.codigoExterno).trim() : null;
    if (body.ativo !== undefined) data.ativo = !!body.ativo;
    if (body.ordem !== undefined && Number.isFinite(Number(body.ordem))) data.ordem = Number(body.ordem);

    try {
        await prisma.opcaoModificador.update({ where: { id }, data });
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return notFound('opção não existe');
        throw err;
    }
});

export const DELETE = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    try {
        await prisma.opcaoModificador.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return notFound('opção não existe');
        throw err;
    }
});
