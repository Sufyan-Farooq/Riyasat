import Riyasat from '@/components/riyasat';
import { Building2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function Page() {
  const ready = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
  if (!ready) return <main className="boot"><Building2 size={40} aria-hidden="true" /><h1>Riyasat is not connected yet</h1><p>Contact your administrator to finish setting up the secure workspace.</p></main>;
  return <Riyasat />;
}
