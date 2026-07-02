import { useState, useEffect, useMemo } from 'react';
import { fetchEnvironments, getCollectionVariables, fetchDotenvFiles } from '../api';
import type { VariableItem } from '../components/VariableInput';

export function useAvailableVariables(activeCollection?: string) {
  const [activeEnvName, setActiveEnvName] = useState('');
  const [activeEnvVars, setActiveEnvVars] = useState<Record<string, string>>({});
  const [collectionVars, setCollectionVars] = useState<Record<string, string>>({});
  const [dotenvVars, setDotenvVars] = useState<{ key: string; source: string }[]>([]);

  useEffect(() => {
    const load = () => {
      fetchEnvironments().then((data: any) => {
        const active = data.environments?.find((e: any) => e.name === data.active);
        setActiveEnvName(active?.name ?? '');
        setActiveEnvVars(active?.variables ?? {});
      }).catch(() => {});
      fetchDotenvFiles().then((data: any) => setDotenvVars(data.variables ?? [])).catch(() => {});
    };
    load();
    window.addEventListener('reqly-reload', load);
    return () => window.removeEventListener('reqly-reload', load);
  }, []);

  useEffect(() => {
    if (!activeCollection) { setCollectionVars({}); return; }
    const load = () => getCollectionVariables(activeCollection).then(setCollectionVars).catch(() => {});
    load();
    window.addEventListener('reqly-reload', load);
    return () => window.removeEventListener('reqly-reload', load);
  }, [activeCollection]);

  const availableVariables: VariableItem[] = useMemo(() => [
    ...Object.entries(collectionVars).map(([k, v]) => ({
      name: k, sourceType: 'collection', sourceName: activeCollection || 'collection', value: v,
    })),
    ...Object.entries(activeEnvVars)
      .filter(([k]) => !(k in collectionVars))
      .map(([k, v]) => ({ name: k, sourceType: 'env', sourceName: activeEnvName || 'env', value: v })),
    ...dotenvVars
      .filter(v => !(v.key in collectionVars) && !(v.key in activeEnvVars))
      .map(v => ({ name: v.key, sourceType: 'dotenv', sourceName: v.source, value: '' })),
  ], [collectionVars, activeEnvVars, activeEnvName, dotenvVars, activeCollection]);

  return availableVariables;
}
