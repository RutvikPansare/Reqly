import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ReqlyCollection, ReqlyRequest } from './api';

export const PREVIEW_SCHEME = 'reqly-request';

/**
 * Read-only preview of a saved request. Prefers the real YAML file on disk
 * (.reqly/collections/<collection>/<request>.yaml) so the preview matches
 * exactly what is committed to git; falls back to pretty-printed JSON from
 * the API when the file cannot be found (e.g. remote project dir).
 */
export class RequestPreviewProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, this)
    );
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }

  async show(request: ReqlyRequest, collection: ReqlyCollection): Promise<void> {
    let text: string;
    let ext = '.yaml';
    const filePath = collection.projectDir
      ? path.join(collection.projectDir, '.reqly', collection.name, `${request.name}.yaml`)
      : undefined;

    if (filePath && fs.existsSync(filePath)) {
      text = fs.readFileSync(filePath, 'utf8');
    } else {
      const { id, examples, ...config } = request as Record<string, unknown>;
      text = JSON.stringify(config, null, 2);
      ext = '.json';
    }

    const uri = vscode.Uri.parse(
      `${PREVIEW_SCHEME}:${collection.name}/${request.name}${ext}`
    );
    this.contents.set(uri.toString(), text);
    this._onDidChange.fire(uri);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: false });
  }
}
