import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import CatalogClient from './CatalogClient';

export const metadata: Metadata = { title: 'Catálogo — PDV' };
export const dynamic = 'force-dynamic';

export default function CatalogPage() {
    return (
        <>
            <Navbar />
            <CatalogClient />
        </>
    );
}
