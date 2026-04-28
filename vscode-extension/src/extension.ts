import * as vscode from 'vscode';
import { ZombieDanceManager } from './zombieDanceManager';
import { ZombieDancePanel } from './zombieDancePanel';

let zombieManager: ZombieDanceManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('Zombie Dance AI extension is now active!');

    zombieManager = new ZombieDanceManager(context);

    // Register commands
    const openPanelCommand = vscode.commands.registerCommand('zombie-dance.openPanel', () => {
        ZombieDancePanel.createOrShow(context.extensionUri);
    });

    const connectCommand = vscode.commands.registerCommand('zombie-dance.connectServer', () => {
        zombieManager.connect();
    });

    const disconnectCommand = vscode.commands.registerCommand('zombie-dance.disconnectServer', () => {
        zombieManager.disconnect();
    });

    const mcpListToolsCommand = vscode.commands.registerCommand('zombie-dance.mcpListTools', async () => {
        await zombieManager.mcpListTools();
    });

    const mcpExecuteToolCommand = vscode.commands.registerCommand('zombie-dance.mcpExecuteTool', async () => {
        await zombieManager.mcpExecuteToolInteractive();
    });

    // Add commands to context
    context.subscriptions.push(openPanelCommand, connectCommand, disconnectCommand, mcpListToolsCommand, mcpExecuteToolCommand);

    // Auto-connect if enabled
    const config = vscode.workspace.getConfiguration('zombie-dance');
    if (config.get('autoConnect')) {
        setTimeout(() => {
            zombieManager.connect();
        }, 2000);
    }

    // Set context for UI visibility
    vscode.commands.executeCommand('setContext', 'zombie-dance.connected', false);
}

export function deactivate() {
    if (zombieManager) {
        zombieManager.dispose();
    }
}
