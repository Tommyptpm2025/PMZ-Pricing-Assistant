import { useState, useEffect, useCallback, useRef } from 'react';
import { normalizeLaborRateInputs, calculateLaborRate, calculateEquipmentRate, type LaborRateInputs } from './calculations';

// Types matching the rate builders (Saved* include id + the builder fields)
export interface SavedLaborRate extends LaborRateInputs {
  id: string;
}

export interface SavedEquipmentProfile {
  id: string;
  description: string;
  startDate: string;
  endDate: string;
  startingValue: number;
  endingValue: number;
  ownership: any[];
  operating: any[];
  estimatedHours: number;
  actualHours: number;
  targetMargin: number;
}

export interface SavedMaterialProfile {
  id: string;
  description: string;
  unitOfMeasure: string;
  baseCost: number;
  deliveryCost: number;
  supplier?: string;
  notes?: string;
}

const LABOR_KEY = 'pmz_labor_rates';
const EQUIPMENT_KEY = 'pmz_equipment_rates';
const MATERIAL_KEY = 'pmz_material_rates';

const STORAGE_EVENT = 'pmz-rates-updated';

// Stable unique ID generator (crypto.randomUUID preferred; fallback for older envs). Never use array index.
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

export function useRateStore() {
  const [laborRates, setLaborRates] = useState<SavedLaborRate[]>([]);
  const [equipmentRates, setEquipmentRates] = useState<SavedEquipmentProfile[]>([]);
  const [materialRates, setMaterialRates] = useState<SavedMaterialProfile[]>([]);

  const hasLoadedRef = useRef(false);

  const loadFromStorage = useCallback(() => {
    // Labor - always defensive, validate array, default [], normalize shape for compatibility
    try {
      const raw = localStorage.getItem(LABOR_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [];
        const normalized = list.map((r: any) => {
          const norm = normalizeLaborRateInputs(r) as SavedLaborRate;
          if (!norm.id || typeof norm.id !== 'string' || norm.id.trim() === '') {
            norm.id = generateId();
          }
          return norm;
        });
        setLaborRates(normalized);
        console.log('[rate-store] Loaded labor rates:', normalized.length);
      } else {
        setLaborRates([]);
        console.log('[rate-store] No labor rates found, defaulting to []');
      }
    } catch (e) {
      console.error('[rate-store] Error loading labor rates, defaulting to []', e);
      setLaborRates([]);
    }

    // Equipment - defensive, validate, default []
    try {
      const raw = localStorage.getItem(EQUIPMENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [];
        setEquipmentRates(list);
        console.log('[rate-store] Loaded equipment rates:', list.length);
      } else {
        setEquipmentRates([]);
        console.log('[rate-store] No equipment rates found, defaulting to []');
      }
    } catch (e) {
      console.error('[rate-store] Error loading equipment rates, defaulting to []', e);
      setEquipmentRates([]);
    }

    // Material - defensive, validate, default []
    try {
      const raw = localStorage.getItem(MATERIAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [];
        setMaterialRates(list);
        console.log('[rate-store] Loaded material rates:', list.length);
      } else {
        setMaterialRates([]);
        console.log('[rate-store] No material rates found, defaulting to []');
      }
    } catch (e) {
      console.error('[rate-store] Error loading material rates, defaulting to []', e);
      setMaterialRates([]);
    }
  }, []);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    loadFromStorage();
    console.log('[rate-store] Initial load from storage (guarded)');

    const handleStorage = (e: StorageEvent) => {
      if (e.key && [LABOR_KEY, EQUIPMENT_KEY, MATERIAL_KEY].includes(e.key)) {
        console.log('[rate-store] storage event for key, reloading:', e.key);
        loadFromStorage();
      }
    };
    window.addEventListener('storage', handleStorage);

    const handleCustom = () => {
      console.log('[rate-store] custom rates-updated event, reloading');
      loadFromStorage();
    };
    window.addEventListener(STORAGE_EVENT, handleCustom as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(STORAGE_EVENT, handleCustom as EventListener);
    };
  }, [loadFromStorage]);

  const reloadFromStorage = () => {
    loadFromStorage();
    console.log('[rate-store] reloadFromStorage() forced fresh read from localStorage');
  };

  // Labor
  const saveLaborRate = (rate: Omit<SavedLaborRate, 'id'>) => {
    const newRate: SavedLaborRate = {
      ...rate,
      id: generateId(),
    };
    const newList = [...laborRates, newRate];
    setLaborRates(newList);
    localStorage.setItem(LABOR_KEY, JSON.stringify(newList));
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
    console.log('[rate-store] saveLaborRate: adding new profile id=', newRate.id, 'role=', (newRate as any).role, 'new total count=', newList.length);
    return newRate.id;
  };

  const updateLaborRate = (id: string, updates: Partial<SavedLaborRate>) => {
    const newList = laborRates.map((r) => (r.id === id ? { ...r, ...updates } : r));
    setLaborRates(newList);
    localStorage.setItem(LABOR_KEY, JSON.stringify(newList));
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
    console.log('[rate-store] updateLaborRate:', id);
  };

  const deleteLaborRate = (id: string) => {
    const newList = laborRates.filter((r) => r.id !== id);
    setLaborRates(newList);
    localStorage.setItem(LABOR_KEY, JSON.stringify(newList));
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
    console.log('[rate-store] deleteLaborRate: deleted ID=', id, 'items remaining=', newList.length);
  };

  const getLaborRates = () => laborRates;

  // Equipment
  const saveEquipmentRate = (rate: Omit<SavedEquipmentProfile, 'id'>) => {
    const newRate: SavedEquipmentProfile = {
      ...rate,
      id: generateId(),
    };
    const newList = [...equipmentRates, newRate];
    setEquipmentRates(newList);
    localStorage.setItem(EQUIPMENT_KEY, JSON.stringify(newList));
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
    console.log('[rate-store] saveEquipmentRate: wrote', newList.length, 'equipment rates to', EQUIPMENT_KEY);
    return newRate.id;
  };

  const updateEquipmentRate = (id: string, updates: Partial<SavedEquipmentProfile>) => {
    const newList = equipmentRates.map((r) => (r.id === id ? { ...r, ...updates } : r));
    setEquipmentRates(newList);
    localStorage.setItem(EQUIPMENT_KEY, JSON.stringify(newList));
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
    console.log('[rate-store] updateEquipmentRate:', id);
  };

  const deleteEquipmentRate = (id: string) => {
    const newList = equipmentRates.filter((r) => r.id !== id);
    setEquipmentRates(newList);
    localStorage.setItem(EQUIPMENT_KEY, JSON.stringify(newList));
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
    console.log('[rate-store] deleteEquipmentRate:', id);
  };

  const getEquipmentRates = () => equipmentRates;

  // Material
  const saveMaterialRate = (rate: Omit<SavedMaterialProfile, 'id'>) => {
    const newRate: SavedMaterialProfile = {
      ...rate,
      id: generateId(),
    };
    const newList = [...materialRates, newRate];
    setMaterialRates(newList);
    localStorage.setItem(MATERIAL_KEY, JSON.stringify(newList));
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
    console.log('[rate-store] saveMaterialRate: wrote', newList.length, 'material rates to', MATERIAL_KEY);
    return newRate.id;
  };

  const updateMaterialRate = (id: string, updates: Partial<SavedMaterialProfile>) => {
    const newList = materialRates.map((r) => (r.id === id ? { ...r, ...updates } : r));
    setMaterialRates(newList);
    localStorage.setItem(MATERIAL_KEY, JSON.stringify(newList));
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
    console.log('[rate-store] updateMaterialRate:', id);
  };

  const deleteMaterialRate = (id: string) => {
    const newList = materialRates.filter((r) => r.id !== id);
    setMaterialRates(newList);
    localStorage.setItem(MATERIAL_KEY, JSON.stringify(newList));
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
    console.log('[rate-store] deleteMaterialRate:', id);
  };

  const getMaterialRates = () => materialRates;

  // Cost rate helpers for EPP per-line-item panels (use current saved profiles)
  const getLaborCostPerHour = (id: string): number => {
    const rate = laborRates.find((r) => r.id === id);
    if (!rate) return 0;
    try {
      const res = calculateLaborRate(rate);
      return res.trueCostPerBillableHour || 0;
    } catch { return 0; }
  };

  const getEquipmentCostPerHour = (id: string): number => {
    const profile = equipmentRates.find((p) => p.id === id);
    if (!profile) return 0;
    try {
      // Single shared source of truth (same fn the Equipment builder uses) — annualizes depreciation.
      return calculateEquipmentRate(profile).totalCostPerHour;
    } catch { return 0; }
  };

  const getMaterialCostPerUnit = (id: string): number => {
    const profile = materialRates.find((m) => m.id === id);
    if (!profile) return 0;
    return Math.round(((profile.baseCost || 0) + (profile.deliveryCost || 0)) * 100) / 100;
  };

  return {
    laborRates,
    equipmentRates,
    materialRates,
    saveLaborRate,
    updateLaborRate,
    deleteLaborRate,
    getLaborRates,
    saveEquipmentRate,
    updateEquipmentRate,
    deleteEquipmentRate,
    getEquipmentRates,
    saveMaterialRate,
    updateMaterialRate,
    deleteMaterialRate,
    getMaterialRates,
    getLaborCostPerHour,
    getEquipmentCostPerHour,
    getMaterialCostPerUnit,
    reloadFromStorage,
  };
}
