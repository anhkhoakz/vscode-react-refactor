/**
 * Configuration Management - VSCode settings management
 */

import * as vscode from 'vscode'

/**
 * Configuration keys
 */
export const ConfigKeys = {
	FunctionType: 'vscodeReactRefactor.functionType',
	BabelPlugins: 'vscodeReactRefactor.babelPlugins',
	EnableDebug: 'vscodeReactRefactor.enableDebug',
} as const

/**
 * Configuration service for managing VSCode settings
 */
export class ConfigService {
	private readonly config: vscode.WorkspaceConfiguration

	constructor() {
		this.config = vscode.workspace.getConfiguration()
	}

	/**
	 * Get function type setting
	 */
	getFunctionType(): 'function' | 'arrowFunction' {
		return this.config.get(ConfigKeys.FunctionType, 'function')
	}

	/**
	 * Get Babel plugins setting
	 */
	getBabelPlugins(): string {
		return this.config.get(
			ConfigKeys.BabelPlugins,
			'objectRestSpread, classProperties, typescript, jsx',
		)
	}

	/**
	 * Get debug enabled setting
	 */
	isDebugEnabled(): boolean {
		return this.config.get(ConfigKeys.EnableDebug, false)
	}

	/**
	 * Check if a configuration change affects this extension
	 */
	affectsConfiguration(
		event: vscode.ConfigurationChangeEvent,
	): boolean {
		return event.affectsConfiguration('vscodeReactRefactor')
	}

	/**
	 * Listen for configuration changes
	 */
	onDidChangeConfiguration(
		callback: (e: vscode.ConfigurationChangeEvent) => void,
	): vscode.Disposable {
		return vscode.workspace.onDidChangeConfiguration(callback)
	}
}
