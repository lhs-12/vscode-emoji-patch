import * as vscode from 'vscode';
import { describeState, disable, enable } from './commands';

export function activate(context: vscode.ExtensionContext): void {
  console.log(`[emoji-patch] ${describeState()}`);
  context.subscriptions.push(
    vscode.commands.registerCommand('emojiPatch.enable', () => enable()),
    vscode.commands.registerCommand('emojiPatch.disable', () => disable()),
  );
}

export function deactivate(): void {
  // 无需清理: 表格格式化只是内存包装, 随 extension host 结束而消失
}
