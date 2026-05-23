import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, badRequest, notFound } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

interface RouteCtx { params: Promise<{ id: string }> }

export const GET = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    const p = await prisma.produto.findUnique({
        where: { id },
        include: {
            categoria: { select: { id: true, nome: true } },
            merchant: { select: { id: true, name: true } },
            grupos: {
                orderBy: { ordem: 'asc' },
                include: {
                    opcoes: { orderBy: { ordem: 'asc' } },
                },
            },
        },
    });
    if (!p) return notFound('produto não existe');
    return NextResponse.json(p);
});

export const PATCH = withAuth(async (req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');

    let body: any;
    try { body = await req.json(); } catch { return badRequest('JSON inválido'); }

    const current = await prisma.produto.findUnique({ where: { id } });
    if (!current) return notFound('produto não existe');

    const data: any = {};
    if (body.nome !== undefined) {
        if (String(body.nome).trim() === '') return badRequest('nome não pode ser vazio');
        data.nome = String(body.nome).trim();
    }
    if (body.descricao !== undefined) data.descricao = body.descricao || null;
    if (body.preco !== undefined) {
        const n = Number(body.preco);
        if (!Number.isFinite(n) || n < 0) return badRequest('preco inválido');
        data.preco = n;
    }
    if (body.sku !== undefined) data.sku = body.sku ? String(body.sku).trim() : null;
    if (body.codigoExterno !== undefined) data.codigoExterno = body.codigoExterno ? String(body.codigoExterno).trim() : null;
    if (body.unidade !== undefined) data.unidade = body.unidade || 'UN';
    if (body.fotoUrl !== undefined) data.fotoUrl = body.fotoUrl || null;
    if (body.preparoMin !== undefined) {
        data.preparoMin = Number.isFinite(Number(body.preparoMin)) ? Number(body.preparoMin) : null;
    }
    if (body.ordem !== undefined && Number.isFinite(Number(body.ordem))) data.ordem = Number(body.ordem);
    if (body.ativo !== undefined) data.ativo = !!body.ativo;
    if (body.categoriaId !== undefined) {
        if (body.categoriaId === null || body.categoriaId === '') {
            data.categoriaId = null;
        } else {
            const cat = await prisma.categoria.findUnique({ where: { id: Number(body.categoriaId) } });
            if (!cat || cat.merchantId !== current.merchantId) {
                return badRequest('categoriaId inválido para este merchant');
            }
            data.categoriaId = Number(body.categoriaId);
        }
    }

    await prisma.produto.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(async (_req: Request, ctx: RouteCtx) => {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (!Number.isFinite(id)) return badRequest('id inválido');
    try {
        await prisma.produto.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (err: any) {
        if (err?.code === 'P2025') return notFound('produto não existe');
        throw err;
    }
});
