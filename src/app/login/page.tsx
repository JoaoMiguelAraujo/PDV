import type { Metadata } from 'next';
import LoginClient from './LoginClient';

export const metadata: Metadata = { title: 'Login — PDV' };
export const dynamic = 'force-dynamic';

export default function LoginPage() {
    return <LoginClient />;
}
