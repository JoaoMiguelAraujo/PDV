import 'server-only';
import type { Prisma } from '@prisma/client';

/**
 * Helpers para os campos do BasicInfo da spec OD v1.7 que persistimos no
 * Merchant. Centraliza validações e a aplicação dos campos no objeto `data`
 * usado em POST/PATCH do CRUD.
 */

/** Enum MerchantCategory da spec (linha 3411 do openapi.yaml). */
export const VALID_MERCHANT_CATEGORIES = [
    'BURGERS', 'PIZZA', 'FAST_FOOD', 'HOT_DOG', 'JAPANESE', 'DESSERTS',
    'AMERICAN', 'ICE_CREAM', 'BBQ', 'SANDWICH', 'MEXICAN', 'BRAZILIAN',
    'PASTRY', 'ARABIAN', 'COMFORT_FOOD', 'VEGETARIAN', 'VEGAN', 'BAKERY',
    'HEALTHY', 'ITALIAN', 'CHINESE', 'JUICE_SMOOTHIES', 'SEAFOOD', 'CAFE',
    'SALADS', 'COFFEE_TEA', 'PASTA', 'BREAKFAST_BRUNCH', 'LATIN_AMERICAN',
    'CONVENIENCE', 'PUB', 'HAWAIIAN', 'EUROPEAN', 'FAMILY_MEALS', 'FRENCH',
    'INDIAN', 'PORTUGUESE', 'SPANISH', 'GOURMET', 'KIDS_FRIENDLY',
    'SOUTH_AMERICAN', 'SPECIALTY_FOODS', 'ARGENTINIAN', 'PREMIUM',
    'AFFORDABLE_MEALS',
] as const;

/** Enum AcceptedCard da spec (linha 3494). */
export const VALID_ACCEPTED_CARDS = [
    'VISA', 'MASTERCARD', 'DINERS', 'AMEX', 'HIPERCARD', 'ELO', 'AURA',
    'DISCOVER', 'VR_BENEFICIOS', 'SODEXO', 'TICKET', 'GOOD_CARD', 'BANESCARD',
    'SOROCARD', 'POLICARD', 'VALECARD', 'AGICARD', 'JCB', 'CREDSYSTEM',
    'CABAL', 'GREEN_CARD', 'VEROCHEQUE', 'AVISTA', 'OTHER',
] as const;

export function isValidCategories(arr: unknown): arr is string[] {
    return Array.isArray(arr) && arr.every(c => typeof c === 'string' && (VALID_MERCHANT_CATEGORIES as readonly string[]).includes(c));
}
export function isValidCards(arr: unknown): arr is string[] {
    return Array.isArray(arr) && arr.every(c => typeof c === 'string' && (VALID_ACCEPTED_CARDS as readonly string[]).includes(c));
}
export function isValidEmails(arr: unknown): arr is string[] {
    return Array.isArray(arr) && arr.every(e => typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

/** Aplica os campos BasicInfo do body no objeto Prisma data. Retorna erro string ou null. */
export function applyBasicInfoFields(body: any, data: Prisma.MerchantUpdateInput | Prisma.MerchantCreateInput): string | null {
    if (body.document !== undefined) {
        if (body.document !== null && body.document !== '' && !/^\d{14}$/.test(String(body.document))) {
            return 'document deve ser CNPJ com 14 dígitos';
        }
        data.document = body.document || null;
    }
    if (body.corporateName !== undefined) data.corporateName = body.corporateName || null;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.averageTicket !== undefined) {
        if (body.averageTicket === null || body.averageTicket === '') {
            data.averageTicket = null;
        } else {
            const n = Number(body.averageTicket);
            if (!Number.isFinite(n) || n < 0) return 'averageTicket inválido';
            data.averageTicket = n;
        }
    }
    if (body.averagePreparationTime !== undefined) {
        if (body.averagePreparationTime === null || body.averagePreparationTime === '') {
            data.averagePreparationTime = null;
        } else {
            const n = Number(body.averagePreparationTime);
            if (!Number.isFinite(n) || n < 0) return 'averagePreparationTime inválido';
            data.averagePreparationTime = n;
        }
    }
    if (body.minOrderValue !== undefined) {
        if (body.minOrderValue === null || body.minOrderValue === '') {
            data.minOrderValue = null;
        } else {
            const n = Number(body.minOrderValue);
            if (!Number.isFinite(n) || n < 0) return 'minOrderValue inválido';
            data.minOrderValue = n;
        }
    }
    if (body.merchantCategories !== undefined) {
        if (body.merchantCategories === null) {
            data.merchantCategoriesJson = null;
        } else if (!isValidCategories(body.merchantCategories)) {
            return 'merchantCategories inválido (enum spec OD)';
        } else {
            data.merchantCategoriesJson = JSON.stringify(body.merchantCategories);
        }
    }
    if (body.acceptedCards !== undefined) {
        if (body.acceptedCards === null) {
            data.acceptedCardsJson = null;
        } else if (!isValidCards(body.acceptedCards)) {
            return 'acceptedCards inválido (enum spec OD)';
        } else {
            data.acceptedCardsJson = JSON.stringify(body.acceptedCards);
        }
    }
    if (body.contactEmails !== undefined) {
        if (body.contactEmails === null) {
            data.contactEmailsJson = null;
        } else if (!isValidEmails(body.contactEmails)) {
            return 'contactEmails inválido (formato e-mail)';
        } else {
            data.contactEmailsJson = JSON.stringify(body.contactEmails);
        }
    }
    if (body.address !== undefined) {
        const a = body.address ?? {};
        if (a.country !== undefined) {
            if (a.country !== null && a.country !== '' && !/^[A-Z]{2}$/.test(String(a.country))) {
                return 'address.country deve ser ISO-3166-1 alpha-2 (ex.: BR)';
            }
            data.addressCountry = a.country || null;
        }
        if (a.state !== undefined) data.addressState = a.state || null;
        if (a.city !== undefined) data.addressCity = a.city || null;
        if (a.district !== undefined) data.addressDistrict = a.district || null;
        if (a.street !== undefined) data.addressStreet = a.street || null;
        if (a.number !== undefined) data.addressNumber = String(a.number ?? '') || null;
        if (a.postalCode !== undefined) data.addressPostalCode = a.postalCode || null;
        if (a.complement !== undefined) data.addressComplement = a.complement || null;
        if (a.reference !== undefined) data.addressReference = a.reference || null;
        if (a.latitude !== undefined) {
            if (a.latitude === null || a.latitude === '') {
                data.addressLatitude = null;
            } else {
                const n = Number(a.latitude);
                if (!Number.isFinite(n) || n < -90 || n > 90) return 'address.latitude inválido';
                data.addressLatitude = n;
            }
        }
        if (a.longitude !== undefined) {
            if (a.longitude === null || a.longitude === '') {
                data.addressLongitude = null;
            } else {
                const n = Number(a.longitude);
                if (!Number.isFinite(n) || n < -180 || n > 180) return 'address.longitude inválido';
                data.addressLongitude = n;
            }
        }
    }
    if (body.contactPhones !== undefined) {
        const p = body.contactPhones ?? {};
        if (p.commercialNumber !== undefined) data.contactCommercialNumber = p.commercialNumber || null;
        if (p.whatsappNumber !== undefined) data.contactWhatsappNumber = p.whatsappNumber || null;
    }
    if (body.logoImageUrl !== undefined) data.logoImageUrl = body.logoImageUrl || null;
    if (body.bannerImageUrl !== undefined) data.bannerImageUrl = body.bannerImageUrl || null;
    if (body.odTtl !== undefined) {
        const n = Number(body.odTtl);
        if (!Number.isFinite(n) || n < 500 || n > 86400) return 'odTtl fora do range OD (500..86400)';
        data.odTtl = n;
    }
    return null;
}
