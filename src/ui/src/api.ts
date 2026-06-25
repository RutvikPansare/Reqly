export async function fetchCollections() {
  const res = await fetch('/api/collections');
  if (!res.ok) throw new Error('Failed to fetch collections');
  return res.json();
}

export async function fetchEnvironments() {
  const res = await fetch('/api/environments');
  if (!res.ok) throw new Error('Failed to fetch environments');
  return res.json();
}

export const createEnvironment = async (name: string) => {
  const res = await fetch('/api/environments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, variables: {} })
  });
  if (!res.ok) throw new Error('Failed to create environment');
  return res.json();
};

export const updateEnvironment = async (name: string, variables: Record<string, string>) => {
  const res = await fetch(`/api/environments/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variables })
  });
  if (!res.ok) throw new Error('Failed to update environment');
  return res.json();
};

export const deleteEnvironment = async (name: string) => {
  const res = await fetch(`/api/environments/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete environment');
  return res.json();
};

export async function setActiveEnvironment(name: string) {
  const res = await fetch('/api/environments/active', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!res.ok) throw new Error('Failed to set active environment');
  return res.json();
}

export async function createCollection(name: string) {
  const res = await fetch('/api/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!res.ok) throw new Error('Failed to create collection');
  return res.json();
}

export async function renameCollection(oldName: string, newName: string) {
  const res = await fetch(`/api/collections/${encodeURIComponent(oldName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName })
  });
  if (!res.ok) throw new Error('Failed to rename collection');
  return res.json();
}

export async function deleteCollection(name: string) {
  const res = await fetch(`/api/collections/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete collection');
  return res.json();
}

export async function duplicateRequest(collectionName: string, requestName: string, newName: string) {
  const res = await fetch(`/api/collections/${encodeURIComponent(collectionName)}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestName, newName })
  });
  if (!res.ok) throw new Error('Failed to duplicate request');
  return res.json();
}

export async function addRequest(collectionName: string, request: any) {
  const res = await fetch(`/api/collections/${collectionName}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  if (!res.ok) throw new Error('Failed to add request');
  return res.json();
}

export async function updateRequest(collectionName: string, oldRequestName: string, request: any) {
  const res = await fetch(`/api/collections/${collectionName}/requests/${oldRequestName}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  if (!res.ok) throw new Error('Failed to update request');
  return res.json();
}

export async function deleteRequest(collectionName: string, requestName: string) {
  const res = await fetch(`/api/collections/${collectionName}/requests/${requestName}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete request');
  return res.json();
}

export async function fetchAuthProfiles() {
  const res = await fetch('/api/auth-profiles');
  if (!res.ok) throw new Error('Failed to fetch auth profiles');
  return res.json();
}

export async function createAuthProfile(profile: any) {
  const res = await fetch('/api/auth-profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile)
  });
  if (!res.ok) throw new Error('Failed to create auth profile');
  return res.json();
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  status: number;
  latency: number;
  requestName?: string;
  collectionName?: string;
}

export async function importCollection(content: string, format: 'postman' | 'bruno', collectionName?: string) {
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, format, collectionName })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Import failed' }));
    throw new Error(err.error || 'Import failed');
  }
  return res.json();
}

export async function fetchHistory(): Promise<HistoryEntry[]> {
  const res = await fetch('/api/history');
  if (!res.ok) throw new Error('Failed to fetch history');
  return res.json();
}

export async function clearHistory() {
  const res = await fetch('/api/history', { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to clear history');
  return res.json();
}
