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

export async function getCollectionVariables(collectionName: string): Promise<Record<string, string>> {
  const res = await fetch(`/api/collections/${encodeURIComponent(collectionName)}/variables`);
  if (!res.ok) throw new Error('Failed to fetch collection variables');
  return res.json();
}

export async function setCollectionVariable(collectionName: string, key: string, value: string) {
  const res = await fetch(`/api/collections/${encodeURIComponent(collectionName)}/variables/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value })
  });
  if (!res.ok) throw new Error('Failed to set collection variable');
  return res.json();
}

export async function deleteCollectionVariable(collectionName: string, key: string) {
  const res = await fetch(`/api/collections/${encodeURIComponent(collectionName)}/variables/${encodeURIComponent(key)}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete collection variable');
  return res.json();
}

export async function getCollectionAuth(collectionName: string): Promise<{ type: string; profileId?: string; credentials?: Record<string, string> } | null> {
  const res = await fetch(`/api/collections/${encodeURIComponent(collectionName)}/auth`);
  if (!res.ok) throw new Error('Failed to fetch collection auth');
  return res.json();
}

export async function setCollectionAuth(collectionName: string, auth: { type: string; profileId?: string; credentials?: Record<string, string> }) {
  const res = await fetch(`/api/collections/${encodeURIComponent(collectionName)}/auth`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(auth)
  });
  if (!res.ok) throw new Error('Failed to set collection auth');
  return res.json();
}

export async function deleteCollectionAuth(collectionName: string) {
  const res = await fetch(`/api/collections/${encodeURIComponent(collectionName)}/auth`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete collection auth');
  return res.json();
}

export async function exportEnvironment(name: string): Promise<void> {
  const res = await fetch(`/api/environments/${encodeURIComponent(name)}/export`);
  if (!res.ok) throw new Error('Failed to export environment');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.postman_environment.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importEnvironmentFromJson(content: string, nameOverride?: string) {
  const res = await fetch('/api/environments/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, nameOverride }),
  });
  if (!res.ok) throw new Error('Failed to import environment');
  return res.json();
}

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

export async function refreshOAuth2Token(profileId: string) {
  const res = await fetch(`/api/auth-profiles/${profileId}/refresh`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to refresh OAuth2 token');
  return res.json();
}

export async function startOAuth2Flow(profileId: string) {
  const res = await fetch(`/api/auth-profiles/${profileId}/authorize`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to start OAuth2 flow');
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

export async function importCollection(content: string, format: 'postman' | 'bruno' | 'insomnia' | 'openapi', collectionName?: string) {
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

export async function importFromCurl(curl: string): Promise<{ url: string; method: string; headers: Record<string, string>; body?: string }> {
  const res = await fetch('/api/import/curl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ curl })
  });
  if (!res.ok) throw new Error('Failed to parse cURL');
  const data = await res.json();
  return data.request;
}

export async function generateCodeSnippet(request: any, target: 'curl' | 'fetch' | 'axios'): Promise<string> {
  const res = await fetch('/api/codegen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request, target })
  });
  if (!res.ok) throw new Error('Failed to generate code');
  const data = await res.json();
  return data.code;
}

export async function exportCollection(name: string, format: 'postman' | 'openapi'): Promise<void> {
  const res = await fetch(`/api/collections/${encodeURIComponent(name)}/export?format=${format}`);
  if (!res.ok) throw new Error('Failed to export collection');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}_${format}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function saveExample(
  collectionName: string,
  requestName: string,
  example: { exampleName: string; status: number; body: any; headers: Record<string, string>; latency: number },
) {
  const res = await fetch(
    `/api/collections/${encodeURIComponent(collectionName)}/requests/${encodeURIComponent(requestName)}/examples`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(example) },
  );
  if (!res.ok) throw new Error('Failed to save example');
  return res.json();
}

export async function listExamples(collectionName: string, requestName: string) {
  const res = await fetch(
    `/api/collections/${encodeURIComponent(collectionName)}/requests/${encodeURIComponent(requestName)}/examples`,
  );
  if (!res.ok) throw new Error('Failed to list examples');
  return res.json();
}
