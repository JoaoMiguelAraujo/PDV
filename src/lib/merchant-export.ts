import 'server-only';
import { createHash } from 'crypto';
import { prisma } from './db';
import type { Merchant, Categoria, Produto, GrupoModificador, OpcaoModificador, MerchantService } from '@prisma/client';

/**
 * Tradução do catálogo interno do PDV para o schema `Merchant` da spec
 * Open Delivery v1.7 (docs/openapi.yaml linha 3086).
 *
 * NÃO inventar campos fora da spec. Em caso de dúvida sobre um campo opcional,
 * omitir é preferível a chutar valor.
 *
 * Como não modelamos múltiplos Menus internamente, geramos UM menu sintético
 * por merchant com UUID determinístico (sha256 do merchantId interno) — assim
 * o `menuId` no Service e o `id` no Menu são estáveis entre exports.
 */

// ===========================================================================
// Tipos fiéis ao schema OD v1.7 (subset que exportamos)
// ===========================================================================

export interface ODPrice {
    value: number;
    currency: string;
}
export interface ODItemPrice {
    value: number;
    originalValue: number;
    currency: string;
}
export interface ODImage {
    URL: string;
}
export interface ODAddress {
    country: string;
    state: string;
    city: string;
    district: string;
    street: string;
    number: string;
    postalCode: string;
    complement: string;
    reference?: string;
    latitude: number;
    longitude: number;
}
export interface ODContactPhones {
    commercialNumber: string;
    whatsappNumber?: string;
}
export interface ODBasicInfo {
    name: string;
    document: string;
    corporateName: string;
    description: string;
    averageTicket?: number;
    averagePreparationTime: number;
    minOrderValue: ODPrice;
    merchantType: 'RESTAURANT';
    merchantCategories: string[];
    address: ODAddress;
    contactEmails: string[];
    contactPhones: ODContactPhones;
    logoImage: ODImage;
    bannerImage?: ODImage;
    acceptedCards?: string[];
}
export interface ODService {
    id: string;
    status: 'AVAILABLE' | 'UNAVAILABLE';
    serviceType: 'DELIVERY' | 'TAKEOUT' | 'INDOOR';
    menuId: string;
    serviceHours: unknown;
    serviceArea?: unknown;
    serviceTiming?: unknown;
}
export interface ODMenu {
    id: string;
    name: string;
    externalCode: string;
    categoryId: string[];
    description?: string;
}
export interface ODCategory {
    id: string;
    index: number;
    name: string;
    externalCode: string;
    status: 'AVAILABLE' | 'UNAVAILABLE';
    description?: string;
    itemOfferId?: string[];
}
export interface ODItem {
    id: string;
    name: string;
    description: string;
    externalCode: string;
    status?: 'AVAILABLE' | 'UNAVAILABLE';
    unit: 'UN' | 'KG' | 'L' | 'OZ' | 'LB' | 'GAL';
    image?: ODImage;
}
export interface ODItemOffer {
    id: string;
    itemId: string;
    index: number;
    status: 'AVAILABLE' | 'UNAVAILABLE';
    price: ODItemPrice;
    optionGroupsId?: string[];
}
export interface ODOptionGroup {
    id: string;
    index: number;
    name: string;
    externalCode: string;
    status: 'AVAILABLE' | 'UNAVAILABLE';
    minPermitted: number;
    maxPermitted: number;
    options?: ODOption[];
}
export interface ODOption {
    id: string;
    itemId?: string;
    index: number;
    status?: 'AVAILABLE' | 'UNAVAILABLE';
    price?: ODItemPrice;
    maxPermitted?: number;
    /**
     * Campo extra fora da spec OD v1.7 (a spec original define Option apenas
     * com id/itemId/index/status/price). Incluímos o nome legível aqui para
     * que consumers — em particular o menuGo importando adicionais — não
     * precisem fazer lookup via itemId em um Item separado. Consumers que
     * respeitam só a spec estrita ignoram campos extras.
     */
    name?: string;
}
export interface ODMerchant {
    lastUpdate: string;
    TTL: number;
    id: string;
    status: 'AVAILABLE' | 'UNAVAILABLE';
    basicInfo: ODBasicInfo;
    services: ODService[];
    menus: ODMenu[];
    categories: ODCategory[];
    itemOffers: ODItemOffer[];
    items: ODItem[];
    optionGroups?: ODOptionGroup[];
    availabilities?: unknown[];
}

// ===========================================================================
// Helpers internos
// ===========================================================================

/** UUID determinístico (v5-like) derivado de um seed — estável entre exports. */
function uuidFromSeed(seed: string): string {
    const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32);
    return [hex.slice(0, 8), hex.slice(8, 12), '5' + hex.slice(13, 16), '8' + hex.slice(17, 20), hex.slice(20, 32)].join('-');
}

function parseJsonArray(s: string | null | undefined): string[] {
    if (!s) return [];
    try {
        const v = JSON.parse(s);
        return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

function unitFromInternal(u: string): ODItem['unit'] {
    const ALLOWED: ODItem['unit'][] = ['UN', 'KG', 'L', 'OZ', 'LB', 'GAL'];
    return (ALLOWED as string[]).includes(u) ? (u as ODItem['unit']) : 'UN';
}

// ===========================================================================
// Export principal
// ===========================================================================

export class MerchantExportIncompleteError extends Error {
    constructor(public missing: string[]) {
        super(`Merchant não exportável — campos obrigatórios ausentes: ${missing.join(', ')}`);
    }
}

/**
 * Monta o objeto Merchant (spec OD v1.7) a partir do estado atual do banco.
 * Lança MerchantExportIncompleteError se BasicInfo está incompleto.
 */
export async function buildMerchantOD(merchantId: number): Promise<ODMerchant> {
    const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId },
        include: {
            categorias: {
                where: { ativo: true },
                orderBy: { ordem: 'asc' },
                include: {
                    produtos: {
                        where: { ativo: true },
                        orderBy: { ordem: 'asc' },
                        include: {
                            grupos: {
                                orderBy: { ordem: 'asc' },
                                include: {
                                    opcoes: {
                                        where: { ativo: true },
                                        orderBy: { ordem: 'asc' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            services: { where: { ativo: true } },
        },
    });
    if (!merchant) throw new Error(`Merchant ${merchantId} não existe`);

    const missing = validateBasicInfo(merchant);
    if (missing.length) throw new MerchantExportIncompleteError(missing);

    const basicInfo = buildBasicInfo(merchant);
    const menuUuid = uuidFromSeed(`menu:${merchant.id}`);

    // Coleta dos itens, ofertas, categorias e option groups.
    const items: ODItem[] = [];
    const itemOffers: ODItemOffer[] = [];
    const optionGroups: ODOptionGroup[] = [];
    const categories: ODCategory[] = [];

    let categoryIndex = 0;
    for (const cat of merchant.categorias) {
        const catOffersIds: string[] = [];
        let offerIndex = 0;
        for (const prod of cat.produtos) {
            const grupoUuids: string[] = [];
            for (const g of prod.grupos) {
                const og: ODOptionGroup = {
                    id: g.uuid,
                    index: g.ordem,
                    name: g.nome,
                    externalCode: String(g.id),
                    status: 'AVAILABLE',
                    minPermitted: g.min,
                    maxPermitted: g.max,
                    options: g.opcoes.map((o, idx) => ({
                        id: o.uuid,
                        index: o.ordem ?? idx,
                        status: o.ativo ? 'AVAILABLE' : 'UNAVAILABLE',
                        price: {
                            value: Number(o.precoAdicional),
                            originalValue: Number(o.precoAdicional),
                            currency: 'BRL',
                        },
                        // Campo extra (fora da spec) com o nome humano da opção.
                        // Necessário pro menuGo conseguir importar como adicional
                        // sem precisar dereferenciar via itemId/Item separado.
                        name: o.nome,
                    })),
                };
                optionGroups.push(og);
                grupoUuids.push(g.uuid);
            }

            items.push({
                id: prod.uuid,
                name: prod.nome,
                description: prod.descricao ?? prod.nome,
                externalCode: prod.codigoExterno ?? prod.sku ?? String(prod.id),
                status: prod.ativo ? 'AVAILABLE' : 'UNAVAILABLE',
                unit: unitFromInternal(prod.unidade),
                ...(prod.fotoUrl ? { image: { URL: prod.fotoUrl } } : {}),
            });

            itemOffers.push({
                id: prod.offerUuid,
                itemId: prod.uuid,
                index: offerIndex++,
                status: prod.ativo ? 'AVAILABLE' : 'UNAVAILABLE',
                price: {
                    value: Number(prod.preco),
                    originalValue: Number(prod.preco),
                    currency: 'BRL',
                },
                ...(grupoUuids.length ? { optionGroupsId: grupoUuids } : {}),
            });
            catOffersIds.push(prod.offerUuid);
        }

        categories.push({
            id: cat.uuid,
            index: categoryIndex++,
            name: cat.nome,
            externalCode: String(cat.id),
            status: cat.ativo ? 'AVAILABLE' : 'UNAVAILABLE',
            ...(cat.descricao ? { description: cat.descricao } : {}),
            ...(catOffersIds.length ? { itemOfferId: catOffersIds } : {}),
        });
    }

    const menus: ODMenu[] = [{
        id: menuUuid,
        name: 'Cardápio principal',
        externalCode: `menu-${merchant.id}`,
        categoryId: categories.map(c => c.id),
    }];

    const services: ODService[] = merchant.services.map(s => ({
        id: s.uuid,
        status: (s.status as 'AVAILABLE' | 'UNAVAILABLE') ?? 'AVAILABLE',
        serviceType: s.serviceType as ODService['serviceType'],
        menuId: menuUuid,
        serviceHours: tryParseJson(s.serviceHoursJson) ?? { id: uuidFromSeed(`hours:${s.id}`), weekHours: [] },
        ...(s.serviceAreaJson ? { serviceArea: tryParseJson(s.serviceAreaJson) } : {}),
        ...(s.serviceTimingJson ? { serviceTiming: tryParseJson(s.serviceTimingJson) } : {}),
    }));

    return {
        lastUpdate: new Date().toISOString(),
        TTL: Math.max(500, Math.min(86400, merchant.odTtl)),
        id: merchant.merchantId,
        status: merchant.ativo ? 'AVAILABLE' : 'UNAVAILABLE',
        basicInfo,
        services,
        menus,
        categories,
        itemOffers,
        items,
        ...(optionGroups.length ? { optionGroups } : {}),
    };
}

function tryParseJson(s: string | null | undefined): unknown {
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
}

function validateBasicInfo(m: Merchant): string[] {
    const missing: string[] = [];
    if (!m.document) missing.push('document');
    if (!m.corporateName) missing.push('corporateName');
    if (!m.description) missing.push('description');
    if (m.averagePreparationTime == null) missing.push('averagePreparationTime');
    if (m.minOrderValue == null) missing.push('minOrderValue');
    if (!m.merchantCategoriesJson || parseJsonArray(m.merchantCategoriesJson).length === 0) {
        missing.push('merchantCategories');
    }
    const addrFields: Array<[string, unknown]> = [
        ['addressCountry', m.addressCountry],
        ['addressState', m.addressState],
        ['addressCity', m.addressCity],
        ['addressDistrict', m.addressDistrict],
        ['addressStreet', m.addressStreet],
        ['addressNumber', m.addressNumber],
        ['addressPostalCode', m.addressPostalCode],
        ['addressLatitude', m.addressLatitude],
        ['addressLongitude', m.addressLongitude],
    ];
    for (const [k, v] of addrFields) if (v == null || v === '') missing.push(k);
    const emails = parseJsonArray(m.contactEmailsJson);
    if (emails.length === 0) missing.push('contactEmails');
    if (!m.contactCommercialNumber) missing.push('contactCommercialNumber');
    if (!m.logoImageUrl) missing.push('logoImageUrl');
    return missing;
}

function buildBasicInfo(m: Merchant): ODBasicInfo {
    const acceptedCards = parseJsonArray(m.acceptedCardsJson);
    return {
        name: m.name,
        document: m.document!,
        corporateName: m.corporateName!,
        description: m.description!,
        ...(m.averageTicket != null ? { averageTicket: Number(m.averageTicket) } : {}),
        averagePreparationTime: m.averagePreparationTime!,
        minOrderValue: { value: Number(m.minOrderValue!), currency: 'BRL' },
        merchantType: 'RESTAURANT',
        merchantCategories: parseJsonArray(m.merchantCategoriesJson),
        address: {
            country: m.addressCountry!,
            state: m.addressState!,
            city: m.addressCity!,
            district: m.addressDistrict!,
            street: m.addressStreet!,
            number: m.addressNumber!,
            postalCode: m.addressPostalCode!,
            complement: m.addressComplement ?? '',
            ...(m.addressReference ? { reference: m.addressReference } : {}),
            latitude: Number(m.addressLatitude!),
            longitude: Number(m.addressLongitude!),
        },
        contactEmails: parseJsonArray(m.contactEmailsJson),
        contactPhones: {
            commercialNumber: m.contactCommercialNumber!,
            ...(m.contactWhatsappNumber ? { whatsappNumber: m.contactWhatsappNumber } : {}),
        },
        logoImage: { URL: m.logoImageUrl! },
        ...(m.bannerImageUrl ? { bannerImage: { URL: m.bannerImageUrl } } : {}),
        ...(acceptedCards.length ? { acceptedCards } : {}),
    };
}
