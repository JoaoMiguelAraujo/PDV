import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import KDSClient from './KDSClient';

export const metadata: Metadata = { title: 'KDS — PDV' };
export const dynamic = 'force-dynamic';

export default function KDSPage() {
    return (
        <>
            <Navbar />
            <KDSClient />
        </>
    );
}
