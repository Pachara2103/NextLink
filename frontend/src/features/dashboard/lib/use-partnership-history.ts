"use client";
import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth-store';
import { partnershipSnapshot } from './partnership-history';
import { restoreDataset } from './local-dataset';
import { dashboardStorageKey } from './demo-storage';
export function usePartnershipHistory() {
  const { user } = useAuth();
  const [state, setState] = useState(() => ({ ...partnershipSnapshot(), ready: false, warnings: [] as string[] }));
  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      const warnings: string[] = [];
      const snapshot = partnershipSnapshot((key, seed, validate) => {
        try { const raw = localStorage.getItem(dashboardStorageKey(user.id, key)); return raw ? restoreDataset(JSON.parse(raw), seed, validate).items : seed; }
        catch { warnings.push(key); return []; }
      });
      setState({ ...snapshot, ready: true, warnings });
    };
    refresh(); window.addEventListener('storage', refresh); window.addEventListener('dashboard-dataset-changed', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('dashboard-dataset-changed', refresh); };
  }, [user]);
  return state;
}
