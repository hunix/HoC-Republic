/**
 * Republic Store — shared state for citizens, population counts,
 * and other republic-wide data that multiple pages consume.
 *
 * Usage:
 *   const { citizens, citizenCount } = useRepublicStore(s => s);
 */

import { create } from "zustand";

export interface Citizen {
  id: string;
  name: string;
  role?: string;
  status?: string;
  avatar?: string;
  [key: string]: unknown;
}

export interface PopulationSummary {
  total: number;
  active: number;
  sleeping: number;
}

interface RepublicStore {
  citizens: Citizen[];
  citizenCount: number;
  population: PopulationSummary;
  loading: boolean;
  error: string | null;
  // Actions
  setCitizens: (citizens: Citizen[], total?: number) => void;
  upsertCitizen: (citizen: Citizen) => void;
  removeCitizen: (id: string) => void;
  setPopulation: (pop: PopulationSummary) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useRepublicStore = create<RepublicStore>((set) => ({
  citizens: [],
  citizenCount: 0,
  population: { total: 0, active: 0, sleeping: 0 },
  loading: true,
  error: null,

  setCitizens: (citizens, total) =>
    set({ citizens, citizenCount: total ?? citizens.length, loading: false, error: null }),

  upsertCitizen: (citizen) =>
    set((s) => ({
      citizens: s.citizens.some((c) => c.id === citizen.id)
        ? s.citizens.map((c) => (c.id === citizen.id ? { ...c, ...citizen } : c))
        : [...s.citizens, citizen],
    })),

  removeCitizen: (id) =>
    set((s) => ({
      citizens: s.citizens.filter((c) => c.id !== id),
      citizenCount: Math.max(0, s.citizenCount - 1),
    })),

  setPopulation: (pop) => set({ population: pop }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));
