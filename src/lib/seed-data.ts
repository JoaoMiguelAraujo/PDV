import 'server-only';
import { randomUUID } from 'crypto';
import { prisma } from './db';
import { encryptSecret } from './crypto-secrets';
import { logger } from './logger';

/**
 * Seed de dados fake completo — Merchant com BasicInfo + Services + Catálogo
 * + Modificadores + Mesas + Insumos + Fichas técnicas + Caixa de exemplo.
 *
 * Idempotente: detecta merchant existente pelo merchantId fixo e pula tudo
 * (a menos que force=true, que apaga e recria — destrutivo!).
 *
 * Disparo: POST /api/admin/seed com header X-Seed-Token = AUTH_SECRET.
 */

const SEED_MERCHANT_ID = '22815773000169-dbc7e35a-c936-4665-9e13-eb55eb8b6824';
const SEED_APP_ID = '0d549e3d-e562-4ec0-b421-e7b19fb933ff';

export interface SeedResult {
    created: boolean;
    skippedReason?: string;
    counts?: {
        merchants: number;
        services: number;
        categorias: number;
        produtos: number;
        grupos: number;
        opcoes: number;
        mesas: number;
        insumos: number;
        fichas: number;
    };
}

export async function runSeed(opts: { force?: boolean } = {}): Promise<SeedResult> {
    const existing = await prisma.merchant.findUnique({ where: { merchantId: SEED_MERCHANT_ID } });
    if (existing && !opts.force) {
        return { created: false, skippedReason: `Merchant ${SEED_MERCHANT_ID} já existe (use force=1 para recriar)` };
    }
    if (existing && opts.force) {
        logger.warn('seed/force apagando merchant existente', { id: existing.id });
        // Apaga merchant — cascade nos catálogos, mesas, comandas, caixas, insumos.
        await prisma.merchant.delete({ where: { id: existing.id } });
    }

    // ------------------------------------------------------------------------
    // 1. Merchant (BasicInfo completo + credenciais OD)
    // ------------------------------------------------------------------------
    const merchant = await prisma.merchant.create({
        data: {
            name: 'Pizzaria Belíssima',
            merchantId: SEED_MERCHANT_ID,
            appId: SEED_APP_ID,
            clientSecretEnc: encryptSecret('seed-hmac-secret-troque-em-prod-1234567890'),
            menugoBaseURL: 'https://app.menugo.com',
            menugoClientId: SEED_APP_ID,
            menugoClientSecretEnc: encryptSecret('seed-oauth-secret-troque-em-prod-abcdef'),
            ativo: true,
            observacao: 'Dados de seed para demonstração e testes. Apague antes de produção.',

            // BasicInfo (spec OD v1.7)
            document: '22815773000169',
            corporateName: 'Belíssima Pizzaria e Restaurante LTDA',
            description: 'Pizzaria artesanal especialista em massa fina e fermentação natural.',
            averageTicket: 75,
            averagePreparationTime: 25,
            minOrderValue: 20.00,
            merchantCategoriesJson: JSON.stringify(['PIZZA', 'ITALIAN', 'FAMILY_MEALS']),
            acceptedCardsJson: JSON.stringify(['VISA', 'MASTERCARD', 'ELO', 'AMEX', 'HIPERCARD']),
            contactEmailsJson: JSON.stringify(['contato@pizzariabelissima.com.br', 'pedidos@pizzariabelissima.com.br']),
            contactCommercialNumber: '11999998888',
            contactWhatsappNumber: '11999998888',
            logoImageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=512&h=512&fit=crop',
            bannerImageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1144&h=400&fit=crop',
            addressCountry: 'BR',
            addressState: 'BR-SP',
            addressCity: 'São Paulo',
            addressDistrict: 'Moema',
            addressStreet: 'Avenida Ibirapuera',
            addressNumber: '2025',
            addressPostalCode: '04029-100',
            addressComplement: 'Loja 12',
            addressReference: 'Em frente ao parque',
            addressLatitude: -23.6105,
            addressLongitude: -46.6660,
            odTtl: 600,
        },
    });

    // ------------------------------------------------------------------------
    // 2. Services (INDOOR + DELIVERY com geoRadius + TAKEOUT)
    // ------------------------------------------------------------------------
    const horarioComum = {
        id: randomUUID(),
        weekHours: [
            {
                dayOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
                timePeriods: { startTime: '18:00:00.000Z', endTime: '23:00:00.000Z' },
            },
            {
                dayOfWeek: ['FRIDAY', 'SATURDAY'],
                timePeriods: { startTime: '18:00:00.000Z', endTime: '01:00:00.000Z' },
            },
            {
                dayOfWeek: ['SUNDAY'],
                timePeriods: { startTime: '18:00:00.000Z', endTime: '23:30:00.000Z' },
            },
        ],
    };
    const services = await Promise.all([
        prisma.merchantService.create({
            data: {
                merchantId: merchant.id,
                serviceType: 'INDOOR',
                status: 'AVAILABLE',
                serviceHoursJson: JSON.stringify(horarioComum),
                menuUuid: deterministicMenuUuid(merchant.id),
                ativo: true,
            },
        }),
        prisma.merchantService.create({
            data: {
                merchantId: merchant.id,
                serviceType: 'DELIVERY',
                status: 'AVAILABLE',
                serviceHoursJson: JSON.stringify(horarioComum),
                serviceAreaJson: JSON.stringify({
                    id: randomUUID(),
                    geoRadius: {
                        center: { latitude: -23.6105, longitude: -46.6660 },
                        radius: 5000,
                    },
                }),
                serviceTimingJson: JSON.stringify({ timing: ['INSTANT', 'SCHEDULED'] }),
                menuUuid: deterministicMenuUuid(merchant.id),
                ativo: true,
            },
        }),
        prisma.merchantService.create({
            data: {
                merchantId: merchant.id,
                serviceType: 'TAKEOUT',
                status: 'AVAILABLE',
                serviceHoursJson: JSON.stringify(horarioComum),
                menuUuid: deterministicMenuUuid(merchant.id),
                ativo: true,
            },
        }),
    ]);

    // ------------------------------------------------------------------------
    // 3. Categorias
    // ------------------------------------------------------------------------
    const [catPizzas, catBebidas, catSobremesas, catEntradas] = await Promise.all([
        prisma.categoria.create({ data: { merchantId: merchant.id, nome: 'Pizzas Salgadas', descricao: 'Massa artesanal fermentada 48h', ordem: 1 } }),
        prisma.categoria.create({ data: { merchantId: merchant.id, nome: 'Bebidas', descricao: 'Refrigerantes, sucos, cervejas e vinhos', ordem: 2 } }),
        prisma.categoria.create({ data: { merchantId: merchant.id, nome: 'Sobremesas', descricao: 'Doces caseiros', ordem: 3 } }),
        prisma.categoria.create({ data: { merchantId: merchant.id, nome: 'Entradas', descricao: 'Para começar', ordem: 0 } }),
    ]);

    // ------------------------------------------------------------------------
    // 4. Produtos
    // ------------------------------------------------------------------------
    const produtos = {
        margherita: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catPizzas.id,
                nome: 'Pizza Margherita', descricao: 'Molho artesanal de tomate, mussarela de búfala, manjericão fresco e azeite.',
                preco: 49.90, sku: 'PZ-MARG', codigoExterno: 'PZ-MARG',
                fotoUrl: 'https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?w=400',
                preparoMin: 25, ordem: 1, unidade: 'UN',
            },
        }),
        calabresa: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catPizzas.id,
                nome: 'Pizza Calabresa', descricao: 'Calabresa artesanal fatiada, cebola roxa, mussarela e azeitona preta.',
                preco: 54.90, sku: 'PZ-CALAB', codigoExterno: 'PZ-CALAB',
                fotoUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400',
                preparoMin: 25, ordem: 2, unidade: 'UN',
            },
        }),
        quatroQueijos: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catPizzas.id,
                nome: 'Pizza Quatro Queijos', descricao: 'Mussarela, gorgonzola, parmesão e provolone.',
                preco: 59.90, sku: 'PZ-4Q', codigoExterno: 'PZ-4Q',
                fotoUrl: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400',
                preparoMin: 28, ordem: 3, unidade: 'UN',
            },
        }),
        cocaLata: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catBebidas.id,
                nome: 'Coca-Cola Lata 350ml', descricao: 'Gelada', preco: 6.50, sku: 'BEB-COCA-LT',
                codigoExterno: 'BEB-COCA-LT', preparoMin: 1, ordem: 1, unidade: 'UN',
            },
        }),
        cocaDoisL: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catBebidas.id,
                nome: 'Coca-Cola 2L', descricao: 'PET 2 litros', preco: 14.90, sku: 'BEB-COCA-2L',
                codigoExterno: 'BEB-COCA-2L', preparoMin: 1, ordem: 2, unidade: 'UN',
            },
        }),
        sucoLaranja: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catBebidas.id,
                nome: 'Suco de Laranja Natural', descricao: 'Espremido na hora, 400ml', preco: 12.90, sku: 'BEB-SUC-LAR',
                codigoExterno: 'BEB-SUC-LAR', preparoMin: 5, ordem: 3, unidade: 'UN',
            },
        }),
        heineken: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catBebidas.id,
                nome: 'Heineken 600ml', descricao: 'Long neck gelada', preco: 18.90, sku: 'BEB-HEIN',
                codigoExterno: 'BEB-HEIN', preparoMin: 1, ordem: 4, unidade: 'UN',
            },
        }),
        pudim: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catSobremesas.id,
                nome: 'Pudim de Leite', descricao: 'Receita da vovó', preco: 12.00, sku: 'SOB-PUD',
                codigoExterno: 'SOB-PUD', preparoMin: 3, ordem: 1, unidade: 'UN',
            },
        }),
        mousseMaracuja: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catSobremesas.id,
                nome: 'Mousse de Maracujá', descricao: 'Com calda da fruta', preco: 11.50, sku: 'SOB-MAR',
                codigoExterno: 'SOB-MAR', preparoMin: 2, ordem: 2, unidade: 'UN',
            },
        }),
        bruschetta: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catEntradas.id,
                nome: 'Bruschetta de Tomate', descricao: 'Pão italiano, tomate fresco, manjericão e parmesão. Porção com 4 unidades.',
                preco: 28.90, sku: 'ENT-BRU', codigoExterno: 'ENT-BRU',
                preparoMin: 8, ordem: 1, unidade: 'UN',
            },
        }),
    };

    // ------------------------------------------------------------------------
    // 5. Modificadores (grupos + opções)
    // ------------------------------------------------------------------------
    // Tamanho de pizza (obrigatório 1 / max 1) — aplicado a todas as pizzas.
    const grupoTamanhoPorPizza: Record<number, number> = {};
    for (const pizza of [produtos.margherita, produtos.calabresa, produtos.quatroQueijos]) {
        const grupo = await prisma.grupoModificador.create({
            data: { produtoId: pizza.id, nome: 'Tamanho', min: 1, max: 1, obrigatorio: true, ordem: 0 },
        });
        grupoTamanhoPorPizza[pizza.id] = grupo.id;
        await prisma.opcaoModificador.createMany({
            data: [
                { grupoId: grupo.id, nome: 'Pequena (4 fatias)', precoAdicional: -10.00, ordem: 0 },
                { grupoId: grupo.id, nome: 'Média (6 fatias)', precoAdicional: 0, ordem: 1 },
                { grupoId: grupo.id, nome: 'Grande (8 fatias)', precoAdicional: 12.00, ordem: 2 },
            ],
        });
        // Adicionais (0..3)
        const gAd = await prisma.grupoModificador.create({
            data: { produtoId: pizza.id, nome: 'Adicionais', min: 0, max: 3, obrigatorio: false, ordem: 1 },
        });
        await prisma.opcaoModificador.createMany({
            data: [
                { grupoId: gAd.id, nome: 'Bacon', precoAdicional: 6.00, ordem: 0 },
                { grupoId: gAd.id, nome: 'Catupiry', precoAdicional: 5.00, ordem: 1 },
                { grupoId: gAd.id, nome: 'Cebola caramelizada', precoAdicional: 4.00, ordem: 2 },
                { grupoId: gAd.id, nome: 'Borda recheada Catupiry', precoAdicional: 8.00, ordem: 3 },
            ],
        });
    }
    // Tamanho do suco
    const gSuc = await prisma.grupoModificador.create({
        data: { produtoId: produtos.sucoLaranja.id, nome: 'Tamanho', min: 1, max: 1, obrigatorio: true, ordem: 0 },
    });
    await prisma.opcaoModificador.createMany({
        data: [
            { grupoId: gSuc.id, nome: '300ml', precoAdicional: -2.00, ordem: 0 },
            { grupoId: gSuc.id, nome: '400ml', precoAdicional: 0, ordem: 1 },
            { grupoId: gSuc.id, nome: '500ml', precoAdicional: 3.00, ordem: 2 },
        ],
    });

    // ------------------------------------------------------------------------
    // 6. Mesas
    // ------------------------------------------------------------------------
    const mesasCount = 10;
    for (let i = 1; i <= mesasCount; i++) {
        await prisma.mesa.create({
            data: {
                merchantId: merchant.id,
                numero: `M${String(i).padStart(2, '0')}`,
                capacidade: i % 3 === 0 ? 6 : 4,
                ativo: true,
            },
        });
    }

    // ------------------------------------------------------------------------
    // 7. Insumos
    // ------------------------------------------------------------------------
    const insumos = {
        massa: await prisma.insumo.create({
            data: { merchantId: merchant.id, nome: 'Massa de pizza pré-aberta', unidade: 'UN', qtdAtual: 150, qtdMinima: 30, custoMedio: 3.5000, sku: 'INS-MASSA' },
        }),
        molhoTomate: await prisma.insumo.create({
            data: { merchantId: merchant.id, nome: 'Molho de tomate artesanal', unidade: 'KG', qtdAtual: 25, qtdMinima: 5, custoMedio: 18.0000, sku: 'INS-MOLHO' },
        }),
        mussarela: await prisma.insumo.create({
            data: { merchantId: merchant.id, nome: 'Mussarela de búfala', unidade: 'KG', qtdAtual: 12, qtdMinima: 3, custoMedio: 65.0000, sku: 'INS-MUSS-BUF' },
        }),
        mussarelaComum: await prisma.insumo.create({
            data: { merchantId: merchant.id, nome: 'Mussarela comum', unidade: 'KG', qtdAtual: 20, qtdMinima: 5, custoMedio: 38.0000, sku: 'INS-MUSS' },
        }),
        calabresa: await prisma.insumo.create({
            data: { merchantId: merchant.id, nome: 'Calabresa artesanal fatiada', unidade: 'KG', qtdAtual: 8, qtdMinima: 2, custoMedio: 42.0000, sku: 'INS-CALAB' },
        }),
        gorgonzola: await prisma.insumo.create({
            data: { merchantId: merchant.id, nome: 'Queijo gorgonzola', unidade: 'KG', qtdAtual: 3, qtdMinima: 1, custoMedio: 95.0000, sku: 'INS-GORG' },
        }),
        manjericao: await prisma.insumo.create({
            data: { merchantId: merchant.id, nome: 'Manjericão fresco', unidade: 'UN', qtdAtual: 30, qtdMinima: 10, custoMedio: 3.0000, sku: 'INS-MANJ' },
        }),
        cocaLata: await prisma.insumo.create({
            data: { merchantId: merchant.id, nome: 'Coca-Cola Lata 350ml', unidade: 'UN', qtdAtual: 80, qtdMinima: 24, custoMedio: 3.5000, sku: 'INS-COCA-LT' },
        }),
        cocaDoisL: await prisma.insumo.create({
            data: { merchantId: merchant.id, nome: 'Coca-Cola 2L', unidade: 'UN', qtdAtual: 18, qtdMinima: 6, custoMedio: 8.5000, sku: 'INS-COCA-2L' },
        }),
        laranja: await prisma.insumo.create({
            data: { merchantId: merchant.id, nome: 'Laranja pera', unidade: 'KG', qtdAtual: 25, qtdMinima: 5, custoMedio: 5.5000, sku: 'INS-LAR' },
        }),
    };

    // ------------------------------------------------------------------------
    // 8. Fichas técnicas (Produto → Insumos × quantidade)
    // ------------------------------------------------------------------------
    await prisma.produtoInsumo.createMany({
        data: [
            // Margherita
            { produtoId: produtos.margherita.id, insumoId: insumos.massa.id, quantidade: 1 },
            { produtoId: produtos.margherita.id, insumoId: insumos.molhoTomate.id, quantidade: 0.150 },
            { produtoId: produtos.margherita.id, insumoId: insumos.mussarela.id, quantidade: 0.180 },
            { produtoId: produtos.margherita.id, insumoId: insumos.manjericao.id, quantidade: 0.2 },
            // Calabresa
            { produtoId: produtos.calabresa.id, insumoId: insumos.massa.id, quantidade: 1 },
            { produtoId: produtos.calabresa.id, insumoId: insumos.molhoTomate.id, quantidade: 0.150 },
            { produtoId: produtos.calabresa.id, insumoId: insumos.mussarelaComum.id, quantidade: 0.180 },
            { produtoId: produtos.calabresa.id, insumoId: insumos.calabresa.id, quantidade: 0.200 },
            // Quatro Queijos
            { produtoId: produtos.quatroQueijos.id, insumoId: insumos.massa.id, quantidade: 1 },
            { produtoId: produtos.quatroQueijos.id, insumoId: insumos.molhoTomate.id, quantidade: 0.150 },
            { produtoId: produtos.quatroQueijos.id, insumoId: insumos.mussarelaComum.id, quantidade: 0.120 },
            { produtoId: produtos.quatroQueijos.id, insumoId: insumos.mussarela.id, quantidade: 0.080 },
            { produtoId: produtos.quatroQueijos.id, insumoId: insumos.gorgonzola.id, quantidade: 0.080 },
            // Coca lata
            { produtoId: produtos.cocaLata.id, insumoId: insumos.cocaLata.id, quantidade: 1 },
            // Coca 2L
            { produtoId: produtos.cocaDoisL.id, insumoId: insumos.cocaDoisL.id, quantidade: 1 },
            // Suco
            { produtoId: produtos.sucoLaranja.id, insumoId: insumos.laranja.id, quantidade: 0.5 },
        ],
    });

    // ------------------------------------------------------------------------
    // 9. Caixa de exemplo (ABERTO)
    // ------------------------------------------------------------------------
    await prisma.caixa.create({
        data: {
            merchantId: merchant.id,
            operadorNome: 'João (seed)',
            valorInicial: 200,
            observacao: 'Caixa de demonstração — abertura padrão do dia',
        },
    });

    const counts = {
        merchants: 1,
        services: services.length,
        categorias: 4,
        produtos: Object.keys(produtos).length,
        grupos: await prisma.grupoModificador.count({ where: { produto: { merchantId: merchant.id } } }),
        opcoes: await prisma.opcaoModificador.count({ where: { grupo: { produto: { merchantId: merchant.id } } } }),
        mesas: mesasCount,
        insumos: Object.keys(insumos).length,
        fichas: await prisma.produtoInsumo.count({ where: { produto: { merchantId: merchant.id } } }),
    };

    return { created: true, counts };
}

// UUID determinístico do Menu — espelha lib/merchant-export uuidFromSeed.
function deterministicMenuUuid(merchantId: number): string {
    const { createHash } = require('crypto');
    const hex = createHash('sha256').update(`menu:${merchantId}`).digest('hex').slice(0, 32);
    return [hex.slice(0, 8), hex.slice(8, 12), '5' + hex.slice(13, 16), '8' + hex.slice(17, 20), hex.slice(20, 32)].join('-');
}
