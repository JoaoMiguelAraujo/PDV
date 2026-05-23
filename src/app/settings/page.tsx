import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import SettingsClient from './SettingsClient';

export const metadata: Metadata = { title: 'Settings — PDV' };
export const dynamic = 'force-dynamic';

export default function SettingsPage() {
    return (
        <>
            <Navbar />
            <SettingsClient />
        </>
    );
}
