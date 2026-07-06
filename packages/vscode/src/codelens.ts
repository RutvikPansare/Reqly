import * as vscode from 'vscode';
import { ReqlyApi, ServerNotRunningError } from './api';
import { DetectedHttpCall, detectHttpCalls, matchSavedRequest } from './codelens-detect';
import { printRunResult } from './commands';

export const CODELENS_LANGUAGES = ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'];

/**
 * "▶ Run with Reqly" lens above fetch/axios/got/request calls (T-236).
 * Clicking runs the matching saved request, or offers to save a new one.
 */
export class ReqlyCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private readonly getApi: () => ReqlyApi) {}

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return detectHttpCalls(document.getText()).map(call => {
      const range = new vscode.Range(call.line, 0, call.line, 0);
      return new vscode.CodeLens(range, {
        title: '▶ Run with Reqly',
        command: 'reqly.runDetectedCall',
        arguments: [call],
      });
    });
  }
}

export function registerCodeLens(
  context: vscode.ExtensionContext,
  getApi: () => ReqlyApi,
  output: vscode.OutputChannel
): void {
  const provider = new ReqlyCodeLensProvider(getApi);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      CODELENS_LANGUAGES.map(language => ({ language, scheme: 'file' })),
      provider
    ),

    vscode.commands.registerCommand('reqly.runDetectedCall', async (call: DetectedHttpCall) => {
      try {
        const api = getApi();
        const collections = await api.getCollections();
        const match = matchSavedRequest(collections, call.url, call.method);

        if (match) {
          const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Window, title: `Reqly: ${match.request.name}` },
            () => api.runRequest(match.request, match.collection.name)
          );
          printRunResult(output, match.request, result);
          output.show(true);
          return;
        }

        if (call.dynamic) {
          vscode.window.showInformationMessage(
            'Reqly: no saved request matches this call, and its URL is dynamic. Save it manually with a {{variable}} URL.'
          );
          return;
        }

        const save = await vscode.window.showInformationMessage(
          `Reqly: no saved request matches ${call.method} ${call.url}.`,
          'Save as new request'
        );
        if (save !== 'Save as new request') return;

        const collectionNames = collections.map(c => c.name);
        const collectionName = await vscode.window.showQuickPick(collectionNames, {
          placeHolder: 'Save into which collection?',
        });
        if (!collectionName) return;
        const defaultName = call.url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-|-$/g, '');
        const name = await vscode.window.showInputBox({ prompt: 'Request name', value: defaultName });
        if (!name) return;

        await api.createRequest(collectionName, { name, method: call.method, url: call.url });
        vscode.window.showInformationMessage(`Reqly: saved "${name}" to ${collectionName}.`);
      } catch (e) {
        if (e instanceof ServerNotRunningError) {
          vscode.window.showWarningMessage(e.message);
        } else {
          vscode.window.showErrorMessage(e instanceof Error ? e.message : String(e));
        }
      }
    })
  );
}
