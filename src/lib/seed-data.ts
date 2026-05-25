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

// Segundo merchant — exemplo do adapter `menugo` (Mesa + Comanda).
// merchantId distinto pra coexistir com o seed OD vanilla acima.
const SEED_MENUGO_MERCHANT_ID = '11222333000144-7f5e1c8a-3d4b-49c1-8a2e-9b6c0e1d4a77';
const SEED_MENUGO_APP_ID = '0d549e3d-e562-4ec0-b421-e7b19fb933ff';

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
    const result = await runSeedPizzariaOD(opts);
    // Segundo merchant — exemplo do adapter menuGo (Mesa + Comanda).
    // Roda em sequência; é idempotente igual ao primeiro.
    await runSeedMenugoMerchant(opts).catch(err =>
        logger.error('seed/menugo merchant falhou (não bloqueia o seed principal)', { message: err?.message })
    );
    return result;
}

/**
 * Cria o segundo merchant de demonstração — hamburgueria operando com
 * Mesa + Comanda (adapter `menugo`). Idempotente.
 */
export async function runSeedMenugoMerchant(opts: { force?: boolean } = {}): Promise<{ created: boolean; skippedReason?: string }> {
    const existing = await prisma.merchant.findUnique({ where: { merchantId: SEED_MENUGO_MERCHANT_ID } });
    if (existing && !opts.force) {
        return { created: false, skippedReason: `Merchant menuGo ${SEED_MENUGO_MERCHANT_ID} já existe` };
    }
    if (existing && opts.force) {
        logger.warn('seed/menugo force apagando merchant existente', { id: existing.id });
        await prisma.merchant.delete({ where: { id: existing.id } });
    }

    const merchant = await prisma.merchant.create({
        data: {
            name: 'Burger Salão Comanda',
            merchantId: SEED_MENUGO_MERCHANT_ID,
            appId: SEED_MENUGO_APP_ID,
            clientSecretEnc: encryptSecret('seed-menugo-hmac-secret-troque-em-prod-aaaaaa'),
            menugoBaseURL: 'https://app.menugo.com',
            menugoClientId: SEED_MENUGO_APP_ID,
            menugoClientSecretEnc: encryptSecret('seed-menugo-oauth-secret-troque-em-prod-bbbbbb'),
            adapterType: 'menugo',
            ativo: true,
            observacao: 'Seed do adapter menuGo (Mesa + Comanda). Apague antes de produção.',

            document: '11222333000144',
            corporateName: 'Burger Salão Comanda Bar e Restaurante LTDA',
            description: 'Hamburgueria artesanal com salão grande — operada em Mesa + Comanda.',
            averageTicket: 60,
            averagePreparationTime: 18,
            minOrderValue: 15.00,
            merchantCategoriesJson: JSON.stringify(['BURGERS', 'SNACKS', 'BBQ']),
            acceptedCardsJson: JSON.stringify(['VISA', 'MASTERCARD', 'ELO']),
            contactEmailsJson: JSON.stringify(['contato@burgersalao.com.br']),
            contactCommercialNumber: '11988887777',
            contactWhatsappNumber: '11988887777',
            logoImageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=512&h=512&fit=crop',
            bannerImageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1144&h=400&fit=crop',
            addressCountry: 'BR',
            addressState: 'BR-SP',
            addressCity: 'São Paulo',
            addressDistrict: 'Pinheiros',
            addressStreet: 'Rua dos Pinheiros',
            addressNumber: '742',
            addressPostalCode: '05422-001',
            addressLatitude: -23.5630,
            addressLongitude: -46.6850,
            odTtl: 600,
        },
    });

    // Service INDOOR — o adapter menuGo é focado em salão.
    await prisma.merchantService.create({
        data: {
            merchantId: merchant.id,
            uuid: randomUUID(),
            menuUuid: deterministicMenuUuid(merchant.id),
            serviceType: 'INDOOR',
            status: 'AVAILABLE',
            serviceHoursJson: JSON.stringify({
                id: randomUUID(),
                weekHours: [
                    {
                        dayOfWeek: ['TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
                        timePeriods: { startTime: '17:00:00.000Z', endTime: '23:30:00.000Z' },
                    },
                ],
            }),
        },
    });

    // ------------------------------------------------------------------------
    // Catálogo — 2 categorias, 4 produtos. Inclui:
    //   - Smash Burger: produto SEM variação, com 2 grupos de adicionais
    //     (Queijo Extra, Molhos).
    //   - Pizza Salão: produto COM 3 variações (P/M/G), com 2 grupos cuja
    //     opções têm preço diferente por variação (Borda, Sabor adicional).
    // ------------------------------------------------------------------------
    const catBurger = await prisma.categoria.create({
        data: {
            merchantId: merchant.id, uuid: randomUUID(),
            nome: 'Hambúrgueres', ordem: 1, ativo: true,
        },
    });
    const catPizza = await prisma.categoria.create({
        data: {
            merchantId: merchant.id, uuid: randomUUID(),
            nome: 'Pizzas do Salão', ordem: 2, ativo: true,
        },
    });

    // ----- Smash Duplo — sem variação, com grupos de adicionais -----
    const smashDuplo = await prisma.produto.create({
        data: {
            merchantId: merchant.id, categoriaId: catBurger.id,
            uuid: randomUUID(), offerUuid: randomUUID(),
            nome: 'Smash Duplo',
            descricao: 'Dois discos de blend 90/10, queijo americano, picles, molho da casa.',
            preco: 32.00, codigoExterno: 'BURG-101', sku: 'BURG-101',
            preparoMin: 12, ordem: 1, ativo: true,
        },
    });

    const grupoQueijoSmash = await prisma.grupoModificador.create({
        data: {
            produtoId: smashDuplo.id, uuid: randomUUID(),
            nome: 'Queijo extra', min: 0, max: 2, obrigatorio: false, ordem: 1,
        },
    });
    await prisma.opcaoModificador.createMany({
        data: [
            { grupoId: grupoQueijoSmash.id, uuid: randomUUID(), nome: 'Cheddar inglês',  precoAdicional: 4.00, codigoExterno: 'SMASH-Q-CHED', ordem: 1, ativo: true },
            { grupoId: grupoQueijoSmash.id, uuid: randomUUID(), nome: 'Provolone',       precoAdicional: 3.50, codigoExterno: 'SMASH-Q-PROV', ordem: 2, ativo: true },
            { grupoId: grupoQueijoSmash.id, uuid: randomUUID(), nome: 'Catupiry',        precoAdicional: 4.50, codigoExterno: 'SMASH-Q-CAT',  ordem: 3, ativo: true },
        ],
    });

    const grupoMolhoSmash = await prisma.grupoModificador.create({
        data: {
            produtoId: smashDuplo.id, uuid: randomUUID(),
            nome: 'Molhos', min: 0, max: 3, obrigatorio: false, ordem: 2,
        },
    });
    await prisma.opcaoModificador.createMany({
        data: [
            { grupoId: grupoMolhoSmash.id, uuid: randomUUID(), nome: 'Maionese da casa', precoAdicional: 0,    codigoExterno: 'MOL-MAI', ordem: 1, ativo: true },
            { grupoId: grupoMolhoSmash.id, uuid: randomUUID(), nome: 'Barbecue',         precoAdicional: 2.00, codigoExterno: 'MOL-BBQ', ordem: 2, ativo: true },
            { grupoId: grupoMolhoSmash.id, uuid: randomUUID(), nome: 'Cheddar líquido',  precoAdicional: 3.00, codigoExterno: 'MOL-CHE', ordem: 3, ativo: true },
        ],
    });

    // ----- Cheddar Bacon — sem variação, sem grupos (produto simples) -----
    await prisma.produto.create({
        data: {
            merchantId: merchant.id, categoriaId: catBurger.id,
            uuid: randomUUID(), offerUuid: randomUUID(),
            nome: 'Cheddar Bacon', descricao: 'Blend 200g, cheddar inglês derretido, bacon crocante.',
            preco: 38.00, codigoExterno: 'BURG-102', sku: 'BURG-102',
            preparoMin: 14, ordem: 2, ativo: true,
        },
    });

    // ----- Pizza Salão — COM variações P/M/G + grupos com opções vinculadas -----
    const pizzaSalao = await prisma.produto.create({
        data: {
            merchantId: merchant.id, categoriaId: catPizza.id,
            uuid: randomUUID(), offerUuid: randomUUID(),
            nome: 'Pizza Salão Margherita',
            descricao: 'Massa de fermentação natural, molho de tomate San Marzano, mussarela de búfala e manjericão fresco. Disponível em 3 tamanhos.',
            preco: 0, // preço vem das variações
            codigoExterno: 'PIZZA-MARG', sku: 'PIZZA-MARG',
            preparoMin: 18, ordem: 1, ativo: true,
        },
    });

    // Variações P/M/G — cada uma com seu preço base.
    const varP = await prisma.produtoVariacao.create({
        data: {
            produtoId: pizzaSalao.id, uuid: randomUUID(),
            nome: 'Pequena', preco: 32.00, codigoExterno: 'PIZZA-MARG-P', ordem: 0, ativo: true,
        },
    });
    const varM = await prisma.produtoVariacao.create({
        data: {
            produtoId: pizzaSalao.id, uuid: randomUUID(),
            nome: 'Média', preco: 48.00, codigoExterno: 'PIZZA-MARG-M', ordem: 1, ativo: true,
        },
    });
    const varG = await prisma.produtoVariacao.create({
        data: {
            produtoId: pizzaSalao.id, uuid: randomUUID(),
            nome: 'Grande', preco: 64.00, codigoExterno: 'PIZZA-MARG-G', ordem: 2, ativo: true,
        },
    });

    // Grupo "Borda" — opções com preço diferente por variação.
    // Borda Recheada: P R$5 / M R$8 / G R$12. Tradicional: grátis em todas.
    const grupoBorda = await prisma.grupoModificador.create({
        data: {
            produtoId: pizzaSalao.id, uuid: randomUUID(),
            nome: 'Borda', min: 1, max: 1, obrigatorio: true, ordem: 1,
        },
    });
    await prisma.opcaoModificador.createMany({
        data: [
            // Tradicional — sem upgrade, vale pra TODAS variações (variacaoId=null).
            { grupoId: grupoBorda.id, uuid: randomUUID(), nome: 'Tradicional', precoAdicional: 0, codigoExterno: 'BORDA-TRAD', variacaoId: null, ordem: 1, ativo: true },
            // Recheada com Catupiry — preço cresce por tamanho.
            { grupoId: grupoBorda.id, uuid: randomUUID(), nome: 'Recheada Catupiry', precoAdicional: 5.00,  codigoExterno: 'BORDA-CAT-P', variacaoId: varP.id, ordem: 2, ativo: true },
            { grupoId: grupoBorda.id, uuid: randomUUID(), nome: 'Recheada Catupiry', precoAdicional: 8.00,  codigoExterno: 'BORDA-CAT-M', variacaoId: varM.id, ordem: 3, ativo: true },
            { grupoId: grupoBorda.id, uuid: randomUUID(), nome: 'Recheada Catupiry', precoAdicional: 12.00, codigoExterno: 'BORDA-CAT-G', variacaoId: varG.id, ordem: 4, ativo: true },
            // Recheada com Cheddar — idem.
            { grupoId: grupoBorda.id, uuid: randomUUID(), nome: 'Recheada Cheddar', precoAdicional: 6.00,  codigoExterno: 'BORDA-CHE-P', variacaoId: varP.id, ordem: 5, ativo: true },
            { grupoId: grupoBorda.id, uuid: randomUUID(), nome: 'Recheada Cheddar', precoAdicional: 9.00,  codigoExterno: 'BORDA-CHE-M', variacaoId: varM.id, ordem: 6, ativo: true },
            { grupoId: grupoBorda.id, uuid: randomUUID(), nome: 'Recheada Cheddar', precoAdicional: 14.00, codigoExterno: 'BORDA-CHE-G', variacaoId: varG.id, ordem: 7, ativo: true },
        ],
    });

    // Grupo "Adicional de sabor" — multiopção (até 3), preço por variação.
    const grupoSabor = await prisma.grupoModificador.create({
        data: {
            produtoId: pizzaSalao.id, uuid: randomUUID(),
            nome: 'Adicional de sabor', min: 0, max: 3, obrigatorio: false, ordem: 2,
        },
    });
    await prisma.opcaoModificador.createMany({
        data: [
            // Calabresa — adicional por variação.
            { grupoId: grupoSabor.id, uuid: randomUUID(), nome: 'Calabresa',       precoAdicional: 5.00,  codigoExterno: 'SAB-CALA-P', variacaoId: varP.id, ordem: 1, ativo: true },
            { grupoId: grupoSabor.id, uuid: randomUUID(), nome: 'Calabresa',       precoAdicional: 7.00,  codigoExterno: 'SAB-CALA-M', variacaoId: varM.id, ordem: 2, ativo: true },
            { grupoId: grupoSabor.id, uuid: randomUUID(), nome: 'Calabresa',       precoAdicional: 10.00, codigoExterno: 'SAB-CALA-G', variacaoId: varG.id, ordem: 3, ativo: true },
            // Bacon.
            { grupoId: grupoSabor.id, uuid: randomUUID(), nome: 'Bacon crocante',  precoAdicional: 6.00,  codigoExterno: 'SAB-BAC-P',  variacaoId: varP.id, ordem: 4, ativo: true },
            { grupoId: grupoSabor.id, uuid: randomUUID(), nome: 'Bacon crocante',  precoAdicional: 9.00,  codigoExterno: 'SAB-BAC-M',  variacaoId: varM.id, ordem: 5, ativo: true },
            { grupoId: grupoSabor.id, uuid: randomUUID(), nome: 'Bacon crocante',  precoAdicional: 13.00, codigoExterno: 'SAB-BAC-G',  variacaoId: varG.id, ordem: 6, ativo: true },
            // Azeitona — preço plano, vale pra todas variações.
            { grupoId: grupoSabor.id, uuid: randomUUID(), nome: 'Azeitona preta',  precoAdicional: 3.00,  codigoExterno: 'SAB-AZE',    variacaoId: null,    ordem: 7, ativo: true },
        ],
    });

    // ----- Veggie Especial — sem variação, grupo opcional simples -----
    const veggie = await prisma.produto.create({
        data: {
            merchantId: merchant.id, categoriaId: catBurger.id,
            uuid: randomUUID(), offerUuid: randomUUID(),
            nome: 'Veggie Especial',
            descricao: 'Hambúrguer de grão-de-bico com queijo provolone e tomate confitado.',
            preco: 35.00, codigoExterno: 'BURG-103', sku: 'BURG-103',
            preparoMin: 14, ordem: 3, ativo: true,
        },
    });
    const grupoExtraVeggie = await prisma.grupoModificador.create({
        data: {
            produtoId: veggie.id, uuid: randomUUID(),
            nome: 'Extras', min: 0, max: 2, obrigatorio: false, ordem: 1,
        },
    });
    await prisma.opcaoModificador.createMany({
        data: [
            { grupoId: grupoExtraVeggie.id, uuid: randomUUID(), nome: 'Cebola caramelizada', precoAdicional: 3.00, codigoExterno: 'VEG-CEB', ordem: 1, ativo: true },
            { grupoId: grupoExtraVeggie.id, uuid: randomUUID(), nome: 'Cogumelo paris',      precoAdicional: 4.50, codigoExterno: 'VEG-COG', ordem: 2, ativo: true },
        ],
    });

    // 6 mesas pra simular salão pequeno-médio.
    await prisma.mesa.createMany({
        data: Array.from({ length: 6 }, (_, i) => ({
            merchantId: merchant.id,
            numero: String(i + 1),
            capacidade: 4,
            ativo: true,
        })),
    });

    return { created: true };
}

async function runSeedPizzariaOD(opts: { force?: boolean } = {}): Promise<SeedResult> {
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
                fotoUrl: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400',
            },
        }),
        cocaDoisL: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catBebidas.id,
                nome: 'Coca-Cola 2L', descricao: 'PET 2 litros', preco: 14.90, sku: 'BEB-COCA-2L',
                codigoExterno: 'BEB-COCA-2L', preparoMin: 1, ordem: 2, unidade: 'UN',
                fotoUrl: 'https://images.unsplash.com/photo-1581636625402-29b2a704ef13?w=400',
            },
        }),
        sucoLaranja: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catBebidas.id,
                nome: 'Suco de Laranja Natural', descricao: 'Espremido na hora, 400ml', preco: 12.90, sku: 'BEB-SUC-LAR',
                codigoExterno: 'BEB-SUC-LAR', preparoMin: 5, ordem: 3, unidade: 'UN',
                fotoUrl: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=400',
            },
        }),
        heineken: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catBebidas.id,
                nome: 'Heineken 600ml', descricao: 'Long neck gelada', preco: 18.90, sku: 'BEB-HEIN',
                codigoExterno: 'BEB-HEIN', preparoMin: 1, ordem: 4, unidade: 'UN',
                fotoUrl: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400',
            },
        }),
        pudim: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catSobremesas.id,
                nome: 'Pudim de Leite', descricao: 'Receita da vovó', preco: 12.00, sku: 'SOB-PUD',
                codigoExterno: 'SOB-PUD', preparoMin: 3, ordem: 1, unidade: 'UN',
                fotoUrl: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400',
            },
        }),
        mousseMaracuja: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catSobremesas.id,
                nome: 'Mousse de Maracujá', descricao: 'Com calda da fruta', preco: 11.50, sku: 'SOB-MAR',
                codigoExterno: 'SOB-MAR', preparoMin: 2, ordem: 2, unidade: 'UN',
                fotoUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400',
            },
        }),
        bruschetta: await prisma.produto.create({
            data: {
                merchantId: merchant.id, categoriaId: catEntradas.id,
                nome: 'Bruschetta de Tomate', descricao: 'Pão italiano, tomate fresco, manjericão e parmesão. Porção com 4 unidades.',
                preco: 28.90, sku: 'ENT-BRU', codigoExterno: 'ENT-BRU',
                preparoMin: 8, ordem: 1, unidade: 'UN',
                fotoUrl: 'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=400',
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
