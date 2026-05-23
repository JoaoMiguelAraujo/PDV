/**
 * Tipos fiéis à spec Open Delivery v1.7 (subset usado pelo PDV).
 *
 * Mantemos apenas os schemas que tocamos:
 *  - Event (entrada do POST /v1/newEvent)
 *  - Order (resposta do GET /v1/orders/{orderId})
 *  - OrderConfirmed, RequestCancelled, RequestDenied (body dos callbacks)
 *  - TokenResponse (POST /oauth/token)
 *
 * Referência: docs/openapi.yaml do menuGo (Abrasel OD v1.7).
 */

// =============================================================================
// Event (webhook POST /v1/newEvent)
// =============================================================================

export type ODEventType =
    | 'CREATED'
    | 'CONFIRMED'
    | 'PREPARATION_REQUESTED'
    | 'PREPARING'
    | 'DISPATCHED'
    | 'READY_FOR_PICKUP'
    | 'PICKUP_AREA_ASSIGNED'
    | 'PICKED_UP'
    | 'DELIVERED'
    | 'CONCLUDED'
    | 'CANCELLATION_REQUESTED'
    | 'CANCELLATION_REQUEST_DENIED'
    | 'CANCELLED'
    | 'ORDER_CANCELLATION_REQUEST'
    | 'CANCELLED_DENIED';

export interface ODEvent {
    eventId: string;          // uuid
    eventType: ODEventType;
    orderId: string;          // uuid
    orderURL: string;
    createdAt: string;        // ISO-8601
    sourceAppId?: string;     // uuid
    virtualBrand?: string;
    metadata?: Record<string, unknown>;
}

// =============================================================================
// Order (GET /v1/orders/{orderId})
// =============================================================================

export type ODOrderType = 'DELIVERY' | 'TAKEOUT' | 'INDOOR';
export type ODUnit = 'UN' | 'KG' | 'L' | 'OZ' | 'LB' | 'GAL';

export interface ODPrice {
    value: number;
    currency: string;         // ISO 4217, ex: 'BRL'
}

export interface ODItem {
    id: string;               // uuid
    index?: number;
    name: string;
    externalCode: string;
    unit: ODUnit;
    ean?: string;
    quantity: number;
    specialInstructions?: string;
    unitPrice: ODPrice;
    originalPrice?: ODPrice;
    totalPrice: ODPrice;
    options?: ODItemOption[];
}

export interface ODItemOption {
    id?: string;
    index?: number;
    name: string;
    externalCode?: string;
    unit?: ODUnit;
    quantity: number;
    specialInstructions?: string;
    unitPrice: ODPrice;
    totalPrice?: ODPrice;
    addition?: ODPrice;
}

export interface ODOrderTotal {
    itemsPrice: ODPrice;
    otherFees: ODPrice;
    discount: ODPrice;
    orderAmount: ODPrice;
    additionalFees?: Array<{ type: string; price: ODPrice }>;
}

export interface ODPaymentMethod {
    value: number;
    currency: string;
    type: 'PREPAID' | 'PENDING';
    method:
        | 'CREDIT'
        | 'DEBIT'
        | 'MEAL_VOUCHER'
        | 'FOOD_VOUCHER'
        | 'DIGITAL_WALLET'
        | 'PIX'
        | 'CASH'
        | 'CREDIT_DEBIT'
        | 'COUPON'
        | 'REDEEM'
        | 'PREPAID_REDEEM'
        | 'OTHER';
    method_info?: string;
    transactionId?: string;
    methodInfo?: string;
    card?: {
        brand?: string;
        prepaid?: boolean;
    };
    prepaid?: number;
}

export interface ODPayments {
    prepaid: number;
    pending: number;
    methods: ODPaymentMethod[];
}

export interface ODOrder {
    id: string;               // uuid
    type: ODOrderType;
    displayId: string;
    sourceAppId?: string;
    salesChannel?: string;
    virtualBrand?: string;
    category?: 'FOOD' | 'GROCERY' | 'DRUGSTORE' | 'PETSTORE';
    createdAt: string;
    lastEvent?: ODEventType;
    orderTiming: 'INSTANT' | 'SCHEDULED' | 'ONDEMAND';
    preparationStartDateTime: string;
    merchant: {
        id: string;
        name: string;
    };
    items: ODItem[];
    otherFees?: Array<{ type: string; price: ODPrice }>;
    total: ODOrderTotal;
    payments: ODPayments;
    indoor?: {
        mode: 'TABLE' | 'COUNTER' | 'ROOM';
        table?: string;
    };
    customer?: {
        id?: string;
        name?: string;
        phone?: { number?: string; localizer?: string };
        documentNumber?: string;
    };
    delivery?: any;
    takeout?: any;
    schedule?: any;
    extraInfo?: string;
}

// =============================================================================
// Bodies de callback (PDV → menuGo)
// =============================================================================

export interface ODOrderConfirmed {
    reason?: string;
    createdAt: string;        // required
    orderExternalCode: string; // required
    preparationTime?: number; // minutos
}

export type ODCancelCode =
    | 'SYSTEMIC_ISSUES'
    | 'DUPLICATE_APPLICATION'
    | 'UNAVAILABLE_ITEM'
    | 'RESTAURANT_WITHOUT_DELIVERY_PERSON'
    | 'OUTDATED_MENU'
    | 'ORDER_OUTSIDE_THE_DELIVERY_AREA'
    | 'BLOCKED_CUSTOMER'
    | 'OUTSIDE_DELIVERY_HOURS'
    | 'INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT'
    | 'RISK_AREA'
    | 'DELIVERY_PROBLEM';

export interface ODRequestCancelled {
    reason: string;
    code: ODCancelCode;
    mode: 'AUTO' | 'MANUAL';
    outOfStockItems?: string[];
    invalidItems?: string[];
}

export interface ODRequestDenied {
    reason: string;
    code: 'DISH_ALREADY_DONE' | 'OUT_FOR_DELIVERY';
}

// =============================================================================
// OAuth2
// =============================================================================

export interface ODTokenResponse {
    access_token: string;
    token_type: 'bearer' | 'Bearer';
    expires_in: number;       // segundos
    scope?: string;           // 'od.all'
}
