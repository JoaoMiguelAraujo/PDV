import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import MerchantsClient from './MerchantsClient';

export const metadata: Metadata = { title: 'Estabelecimentos — PDV' };
export const dynamic = 'force-dynamic';

export default function MerchantsPage() {
    return (
        <>
            <Navbar />
            <MerchantsClient />
        </>
    );
}
