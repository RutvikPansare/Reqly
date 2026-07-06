import * as vscode from 'vscode';
import { ReqlyApi } from './api';
import { ReqlyTreeProvider } from './tree';
import { EnvironmentStatusBar } from './statusBar';
import { RequestPreviewProvider } from './preview';
import { registerCommands } from './commands';
import { registerCodeLens } from './codelens';

function createApi(): ReqlyApi {
  const url = vscode.workspace.getConfiguration('reqly').get<string>('serverUrl') ?? 'http://localhost:4242';
  return new ReqlyApi(url.replace(/\/$/, ''));
}

export function activate(context: vscode.ExtensionContext): void {
  const getApi = createApi;

  const output = vscode.window.createOutputChannel('Reqly');
  context.subscriptions.push(output);

  const tree = new ReqlyTreeProvider(getApi);
  context.subscriptions.push(vscode.window.registerTreeDataProvider('reqlyCollections', tree));

  const statusBar = new EnvironmentStatusBar(getApi);
  context.subscriptions.push(statusBar);

  const preview = new RequestPreviewProvider();
  preview.register(context);

  registerCommands(context, { getApi, tree, statusBar, preview, output });
  registerCodeLens(context, getApi, output);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('reqly.serverUrl')) {
        tree.refresh();
        void statusBar.refresh();
      }
    })
  );

  void statusBar.refresh();
}

export function deactivate(): void {}
