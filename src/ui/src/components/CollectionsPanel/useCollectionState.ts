import { useEffect, useState } from 'react';
import {
  fetchCollections, createCollection, addRequest, deleteRequest,
  updateRequest, renameCollection, deleteCollection, duplicateCollection,
  duplicateRequest, moveRequest, deleteExample,
} from '../../api.js';
import { useLocalStorage } from '../../hooks/useLocalStorage.js';
import type { ContextMenuState, MoveModalState } from './types.js';

export function useCollectionState(onSelectRequest: (req: any, col: string) => void, defaultRequestType?: string) {
  const [collections, setCollections] = useState<any[]>([]);
  const [projectPath, setProjectPath] = useState('');
  const [expandedCols, setExpandedCols] = useLocalStorage<Record<string, boolean>>('reqly.expandedCols', {});
  const [expandedReqs, setExpandedReqs] = useLocalStorage<Record<string, boolean>>('reqly.expandedReqs', {});

  const [creatingCol, setCreatingCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [addingReqTo, setAddingReqTo] = useState<string | null>(null);
  const [newReqName, setNewReqName] = useState('');
  const [renaming, setRenaming] = useState<{ col: string; req: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [colRenameValue, setColRenameValue] = useState('');
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<{ name: string; format: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [draggedReq, setDraggedReq] = useState<{ col: string; req: string } | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [moveModal, setMoveModal] = useState<MoveModalState | null>(null);
  const [hasEverConnectedAgent, setHasEverConnectedAgent] = useState(false);

  const loadData = () => {
    fetchCollections().then(setCollections).catch(console.error);
    fetch('/api/project').then(r => r.json()).then(d => {
      setProjectPath(d.path);
      setHasEverConnectedAgent(d.hasEverConnectedAgent);
    }).catch(() => {});
  };

  useEffect(() => {
    loadData();
    const closeMenu = () => setContextMenu(null);
    const onExampleSaved = (e: Event) => {
      const { col, req } = (e as CustomEvent).detail;
      setExpandedReqs(p => ({ ...p, [`${col}/${req}`]: true }));
    };
    const onRequestSaved = (e: Event) => {
      const { col } = (e as CustomEvent).detail;
      setExpandedCols(p => ({ ...p, [col]: true }));
    };
    const onImportSuccess = (e: Event) => setImportSuccess((e as CustomEvent).detail);
    document.addEventListener('click', closeMenu);
    window.addEventListener('reqly-reload', loadData);
    window.addEventListener('reqly-example-saved', onExampleSaved);
    window.addEventListener('reqly-request-saved', onRequestSaved as any);
    window.addEventListener('reqly-import-success', onImportSuccess);
    return () => {
      document.removeEventListener('click', closeMenu);
      window.removeEventListener('reqly-reload', loadData);
      window.removeEventListener('reqly-example-saved', onExampleSaved);
      window.removeEventListener('reqly-request-saved', onRequestSaved as any);
      window.removeEventListener('reqly-import-success', onImportSuccess);
    };
  }, []);

  const handleCreateCol = async () => {
    const trimmed = newColName.trim();
    if (trimmed) {
      if (collections.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
        alert(`Collection '${trimmed}' already exists.`);
        return;
      }
      await createCollection(trimmed);
      setExpandedCols(prev => ({ ...prev, [trimmed]: true }));
      loadData();
    }
    setCreatingCol(false);
    setNewColName('');
  };

  const handleAddReq = async (colName: string) => {
    if (newReqName.trim()) {
      const req = defaultRequestType
        ? { name: newReqName.trim(), type: defaultRequestType, url: '' }
        : { name: newReqName.trim(), method: 'GET', url: 'https://api.example.com' };
      await addRequest(colName, req);
      onSelectRequest(req, colName);
      loadData();
    }
    setAddingReqTo(null);
    setNewReqName('');
  };

  const handleDeleteReq = async (col: string, req: string) => { await deleteRequest(col, req); loadData(); };
  const handleDeleteExample = async (col: string, req: string, id: string) => { await deleteExample(col, req, id); loadData(); };
  const handleDuplicateReq = async (col: string, req: string) => { await duplicateRequest(col, req, `${req} Copy`); loadData(); };
  const handleDeleteCol = async (col: string) => { await deleteCollection(col); loadData(); };
  const handleDuplicateCol = async (col: string) => { await duplicateCollection(col); loadData(); };

  const handleMoveReq = async (col: string, req: string, target: string) => {
    if (col === target) return;
    try {
      const result = await moveRequest(col, req, target);
      const updated = await fetchCollections();
      setCollections(updated);
      const targetCol = updated.find((c: any) => c.name === result.collection);
      const movedReq = targetCol?.requests.find((r: any) => r.name === result.name);
      if (movedReq) onSelectRequest(movedReq, result.collection);
    } catch {
      alert('Failed to move request');
    }
  };

  const startRenameCol = (col: string) => { setRenamingCol(col); setColRenameValue(col); };
  const commitRenameCol = async () => {
    if (!renamingCol) return;
    if (colRenameValue.trim() && colRenameValue.trim() !== renamingCol) {
      await renameCollection(renamingCol, colRenameValue.trim());
      loadData();
    }
    setRenamingCol(null); setColRenameValue('');
  };

  const startRename = (col: string, req: string) => { setRenaming({ col, req }); setRenameValue(req); };
  const commitRename = async () => {
    if (!renaming) return;
    if (renameValue.trim() && renameValue.trim() !== renaming.req) {
      const collection = collections.find(c => c.name === renaming.col);
      const reqObj = collection?.requests.find((r: any) => r.name === renaming.req);
      if (reqObj) { await updateRequest(renaming.col, renaming.req, { ...reqObj, name: renameValue.trim() }); loadData(); }
    }
    setRenaming(null); setRenameValue('');
  };

  const handleSetAddingReqTo = (col: string | null, expand?: boolean) => {
    setAddingReqTo(col);
    if (col && expand) setExpandedCols(p => ({ ...p, [col]: true }));
  };

  return {
    collections, setCollections, projectPath, setProjectPath,
    hasEverConnectedAgent, setHasEverConnectedAgent,
    expandedCols, setExpandedCols, expandedReqs, setExpandedReqs,
    creatingCol, setCreatingCol, newColName, setNewColName,
    addingReqTo, newReqName, setNewReqName,
    renaming, setRenaming, renameValue, setRenameValue,
    renamingCol, setRenamingCol, colRenameValue, setColRenameValue,
    settingsFor, setSettingsFor, importSuccess, setImportSuccess,
    contextMenu, setContextMenu, draggedReq, setDraggedReq,
    dragOverCol, setDragOverCol, moveModal, setMoveModal,
    loadData,
    handleCreateCol, handleAddReq, handleDeleteReq, handleDeleteExample,
    handleDuplicateReq, handleDeleteCol, handleDuplicateCol, handleMoveReq,
    startRenameCol, commitRenameCol, startRename, commitRename,
    handleSetAddingReqTo,
  };
}
