import * as vscode from 'vscode';
import { CollectionRunResult, ReqlyApi, ReqlyCollection, ReqlyRequest, RunResult } from './api';
import { CollectionNode, ReqlyTreeProvider, RequestNode } from './tree';
import { EnvironmentStatusBar } from './statusBar';
import { RequestPreviewProvider } from './preview';

interface CommandDeps {
  getApi: () => ReqlyApi;
  tree: ReqlyTreeProvider;
  statusBar: EnvironmentStatusBar;
  preview: RequestPreviewProvider;
  output: vscode.OutputChannel;
}

function formatBody(body: unknown): string {
  if (body === null || body === undefined) return '';
  if (typeof body === 'string') {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return JSON.stringify(body, null, 2);
}

export function printRunResult(
  output: vscode.OutputChannel,
  request: ReqlyRequest,
  result: RunResult
): void {
  const { response } = result;
  output.appendLine('');
  output.appendLine(`── ${request.method} ${request.url} (${request.name})`);
  output.appendLine(`   ${response.status} · ${response.latency}ms`);
  const assertions = result.assertions ?? [];
  for (const a of assertions) {
    output.appendLine(`   ${a.passed ? '✓' : '✗'} ${a.name ?? 'assertion'}`);
  }
  const tests = result.testResults ?? [];
  for (const t of tests) {
    output.appendLine(`   ${t.passed ? '✓' : '✗'} ${t.name}${t.error ? ` - ${t.error}` : ''}`);
  }
  const body = formatBody(response.body);
  if (body) output.appendLine(body);
}

async function pickCollection(api: ReqlyApi): Promise<ReqlyCollection | undefined> {
  const collections = await api.getCollections();
  if (collections.length === 0) {
    vscode.window.showInformationMessage('No Reqly collections found in the active project.');
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    collections.map(c => ({ label: c.name, description: `${c.requests.length} requests`, collection: c })),
    { placeHolder: 'Select a collection' }
  );
  return pick?.collection;
}

async function pickRequest(collection: ReqlyCollection): Promise<ReqlyRequest | undefined> {
  const pick = await vscode.window.showQuickPick(
    collection.requests.map(r => ({ label: r.name, description: `${r.method} ${r.url}`, request: r })),
    { placeHolder: `Select a request from ${collection.name}` }
  );
  return pick?.request;
}

export function registerCommands(context: vscode.ExtensionContext, deps: CommandDeps): void {
  const { getApi, tree, statusBar, preview, output } = deps;

  const showError = (e: unknown) => {
    vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('reqly.refreshCollections', async () => {
      tree.refresh();
      await statusBar.refresh();
    }),

    vscode.commands.registerCommand('reqly.previewRequest', async (node: RequestNode) => {
      try {
        await preview.show(node.request, node.collection);
      } catch (e) {
        showError(e);
      }
    }),

    vscode.commands.registerCommand('reqly.runRequest', async (node?: RequestNode) => {
      try {
        const api = getApi();
        let request = node?.request;
        let collection = node?.collection;
        if (!request || !collection) {
          collection = await pickCollection(api);
          if (!collection) return;
          request = await pickRequest(collection);
          if (!request) return;
        }
        const result = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Window, title: `Reqly: ${request.name}` },
          () => api.runRequest(request!, collection!.name)
        );
        printRunResult(output, request, result);
        output.show(true);
      } catch (e) {
        showError(e);
      }
    }),

    vscode.commands.registerCommand('reqly.runCollection', async (node?: CollectionNode) => {
      try {
        const api = getApi();
        const collection = node?.collection ?? (await pickCollection(api));
        if (!collection) return;
        const result: CollectionRunResult = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Window, title: `Reqly: running ${collection.name}` },
          () => api.runCollection(collection.name)
        );
        output.appendLine('');
        output.appendLine(`══ Collection run: ${collection.name}`);
        const summary = result.summary;
        if (summary) {
          output.appendLine(`   ${summary.passed}/${summary.total} passed, ${summary.failed} failed`);
        } else {
          output.appendLine(JSON.stringify(result, null, 2));
        }
        output.show(true);
        if (summary && summary.failed > 0) {
          vscode.window.showWarningMessage(`Reqly: ${summary.failed} request(s) failed in ${collection.name}`);
        }
      } catch (e) {
        showError(e);
      }
    }),

    vscode.commands.registerCommand('reqly.switchEnvironment', async () => {
      try {
        const api = getApi();
        const { environments, active } = await api.getEnvironments();
        if (environments.length === 0) {
          vscode.window.showInformationMessage('No Reqly environments defined in the active project.');
          return;
        }
        const pick = await vscode.window.showQuickPick(
          environments.map(e => ({
            label: e.name,
            description: e.name === active ? 'active' : undefined,
          })),
          { placeHolder: 'Select the active Reqly environment' }
        );
        if (!pick || pick.label === active) return;
        await api.setActiveEnvironment(pick.label);
        await statusBar.refresh();
        vscode.window.showInformationMessage(`Reqly environment switched to ${pick.label}`);
      } catch (e) {
        showError(e);
      }
    }),

    vscode.commands.registerCommand('reqly.startProxy', async () => {
      try {
        const portStr = await vscode.window.showInputBox({
          prompt: 'Proxy port',
          value: '7474',
          validateInput: v => (/^\d+$/.test(v) ? undefined : 'Enter a port number'),
        });
        if (!portStr) return;
        const collectionName = await vscode.window.showInputBox({
          prompt: 'Collection to capture requests into',
          value: 'captured',
        });
        if (!collectionName) return;
        await getApi().startProxy(Number(portStr), collectionName);
        vscode.window.showInformationMessage(
          `Reqly proxy started on port ${portStr}, capturing into "${collectionName}"`
        );
      } catch (e) {
        showError(e);
      }
    }),

    vscode.commands.registerCommand('reqly.openUI', () => {
      vscode.env.openExternal(vscode.Uri.parse(getApi().getBaseUrl()));
    })
  );
}
