import * as vscode from 'vscode';
import { ReqlyApi } from './api';

/**
 * Persistent status bar item showing the active Reqly environment.
 * Click opens the environment QuickPick (reqly.switchEnvironment).
 */
export class EnvironmentStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor(private readonly getApi: () => ReqlyApi) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.command = 'reqly.switchEnvironment';
    this.item.tooltip = 'Switch Reqly environment';
  }

  async refresh(): Promise<void> {
    try {
      const { active } = await this.getApi().getEnvironments();
      this.item.text = `$(server-environment) Reqly: ${active ?? 'no env'}`;
      this.item.show();
    } catch {
      this.item.text = '$(server-environment) Reqly: offline';
      this.item.tooltip = 'Reqly server is not running. Start it with "reqly start".';
      this.item.show();
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
