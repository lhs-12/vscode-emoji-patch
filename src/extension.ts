import * as vscode from 'vscode';
import { describeState, disable, enable } from './commands';
import { uninstallPreviewPatch } from './preview';

export function activate(context: vscode.ExtensionContext): void {
  // 状态检查会顺手装内存包装, 但任何一步失败都只应记一行日志, 不能连累命令注册
  let state: string;
  try {
    state = describeState();
  } catch (err) {
    state = `状态检查失败: ${err instanceof Error ? err.message : String(err)}`;
  }
  console.log(`[emoji-patch] ${state}`);
  context.subscriptions.push(
    vscode.commands.registerCommand('emojiPatch.enable', () => enable()),
    vscode.commands.registerCommand('emojiPatch.disable', () => disable()),
  );
}

export function deactivate(): void {
  // 内存包装 (表格格式化 / 预览注入) 都在扩展宿主进程里, 结束即消失.
  // 但还是显式拆掉预览注入: 扩展被停用时不必等宿主退出.
  uninstallPreviewPatch();
}
