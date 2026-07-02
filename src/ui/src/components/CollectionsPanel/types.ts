export interface CollectionsPanelProps {
  activeRequest: any;
  onSelectRequest: (req: any, collectionName: string) => void;
  onRunCollection: (name: string) => void;
  typeFilter?: string[];
  defaultRequestType?: string;
}

export type ContextMenuState =
  | { x: number; y: number; type: 'col'; col: string }
  | { x: number; y: number; type: 'req'; col: string; req: string }
  | { x: number; y: number; type: 'example'; col: string; req: string; exampleId: string }
  | null;

export interface MoveModalState {
  col: string;
  req: string;
}
