import * as vscode from 'vscode';
import { ReqlyApi, ReqlyCollection, ReqlyRequest, ServerNotRunningError } from './api';

export type ReqlyNode = ProjectNode | CollectionNode | RequestNode;

export class ProjectNode extends vscode.TreeItem {
  constructor(
    public readonly projectDir: string,
    public readonly collections: ReqlyCollection[]
  ) {
    super(projectDir.split('/').pop() ?? projectDir, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'reqlyProject';
    this.iconPath = new vscode.ThemeIcon('root-folder');
    this.tooltip = projectDir;
  }
}

export class CollectionNode extends vscode.TreeItem {
  constructor(public readonly collection: ReqlyCollection) {
    super(collection.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'reqlyCollection';
    this.iconPath = new vscode.ThemeIcon('folder');
    this.description = `${collection.requests.length}`;
    this.tooltip = collection.description ?? collection.name;
  }
}

const METHOD_ICONS: Record<string, string> = {
  GET: 'arrow-down',
  POST: 'arrow-up',
  PUT: 'arrow-swap',
  PATCH: 'edit',
  DELETE: 'trash',
};

export class RequestNode extends vscode.TreeItem {
  constructor(
    public readonly request: ReqlyRequest,
    public readonly collection: ReqlyCollection
  ) {
    super(request.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'reqlyRequest';
    const label = request.type && request.type !== 'rest' ? request.type.toUpperCase() : request.method;
    this.description = label;
    this.iconPath = new vscode.ThemeIcon(METHOD_ICONS[request.method] ?? 'globe');
    this.tooltip = `${label} ${request.url}`;
    this.command = {
      command: 'reqly.previewRequest',
      title: 'Preview Request',
      arguments: [this],
    };
  }
}

export class ReqlyTreeProvider implements vscode.TreeDataProvider<ReqlyNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private collections: ReqlyCollection[] = [];
  private serverUp = true;

  constructor(private readonly getApi: () => ReqlyApi) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  isServerUp(): boolean {
    return this.serverUp;
  }

  getTreeItem(element: ReqlyNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ReqlyNode): Promise<ReqlyNode[]> {
    if (!element) {
      try {
        this.collections = await this.getApi().getCollections();
        this.serverUp = true;
      } catch (e) {
        this.serverUp = false;
        if (e instanceof ServerNotRunningError) {
          // Empty tree makes VS Code show the viewsWelcome content with the
          // "server not running" hint instead of an error toast.
          return [];
        }
        throw e;
      }

      const byProject = new Map<string, ReqlyCollection[]>();
      for (const col of this.collections) {
        const dir = col.projectDir ?? '';
        byProject.set(dir, [...(byProject.get(dir) ?? []), col]);
      }
      // Single project: skip the project level, list collections directly.
      if (byProject.size <= 1) {
        return this.collections.map(c => new CollectionNode(c));
      }
      return Array.from(byProject.entries()).map(([dir, cols]) => new ProjectNode(dir, cols));
    }

    if (element instanceof ProjectNode) {
      return element.collections.map(c => new CollectionNode(c));
    }
    if (element instanceof CollectionNode) {
      return element.collection.requests.map(r => new RequestNode(r, element.collection));
    }
    return [];
  }
}
