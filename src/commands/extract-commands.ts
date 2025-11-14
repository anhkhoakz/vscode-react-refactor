/**
 * Extract Commands - Command handlers for extraction operations
 */

import type * as vscode from 'vscode'
import type { RefactoringService } from '../services/refactoring-service'
import type { IVSCodeService } from '../types'

/**
 * Register extract commands
 */
export function registerExtractCommands(
	context: vscode.ExtensionContext,
	refactoringService: RefactoringService,
	vscodeService: IVSCodeService,
): void {
	// Register extract to function command
	context.subscriptions.push(
		vscodeService.registerCommand(
			'extension.react-refactor.extractToFunction',
			async () => {
				try {
					await refactoringService.extractToComponent(
						false,
					)
				} catch (error) {
					const errorMessage =
						error instanceof Error
							? error.message
							: 'Unknown error occurred'
					vscodeService.showErrorMessage(
						`Failed to extract component: ${errorMessage}`,
					)
				}
			},
		),
	)

	// Register extract to class command
	context.subscriptions.push(
		vscodeService.registerCommand(
			'extension.react-refactor.extractToClass',
			async () => {
				try {
					await refactoringService.extractToComponent(
						true,
					)
				} catch (error) {
					const errorMessage =
						error instanceof Error
							? error.message
							: 'Unknown error occurred'
					vscodeService.showErrorMessage(
						`Failed to extract component: ${errorMessage}`,
					)
				}
			},
		),
	)
}
