import { useEffect, useState } from 'react';
import axios from 'axios';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { clearSession, getToken } from './auth';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
});

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// --- attach the bearer token to every request -------------------------
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

// --- a dead token anywhere ends the session ---------------------------
api.interceptors.response.use(
  (r) => r,
  (error) => {
    const url: string = error?.config?.url ?? '';
    if (error?.response?.status === 401 && !url.includes('/auth/login')) {
      clearSession();
      queryClient.clear();
      window.location.hash = '';
    }
    return Promise.reject(error);
  },
);


/** Unwrap the `{success, data}` envelope used by every backend controller. */
export function useApi<T = any>(path: string, enabled = true) {
  return useQuery<T>({
    queryKey: [path],
    enabled,
    queryFn: async () => {
      const r = await api.get(path);
      return (r.data?.data ?? null) as T;
    },
  });
}

export const errMsg = (e: any) =>
  e?.response?.data?.message || e?.message || 'Request failed';

export type League = {
  id: string;
  name: string;
  description?: string;
  sport: string;
  season: string;
  start_date: string;
  end_date: string;
  status: 'UPCOMING' | 'ONGOING' | 'FINISHED';
};

const LEAGUE_KEY = 'leagueId';

/**
 * Shared league selection: fetched once, persisted to localStorage so the
 * Dashboard, Leagues and Teams pages all look at the same competition.
 */
export function useLeague() {
  const q = useApi<League[]>('/leagues');
  const [selected, setSelected] = useState<string>(
    () => localStorage.getItem(LEAGUE_KEY) || '',
  );

  const list = q.data ?? [];
  // Fall back to the first league if nothing is stored, or if the stored id
  // no longer exists (e.g. after a re-seed).
  const valid = list.some((l) => l.id === selected);
  const leagueId = valid ? selected : list[0]?.id ?? '';

  useEffect(() => {
    if (leagueId) localStorage.setItem(LEAGUE_KEY, leagueId);
  }, [leagueId]);

  return {
    list,
    leagueId,
    league: list.find((l) => l.id === leagueId),
    select: setSelected,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
  };
}
