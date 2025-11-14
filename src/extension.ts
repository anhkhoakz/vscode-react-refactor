/**
 * VSCode Extension Entry Point
 */

import type * as vscode from 'vscode'
import { registerExtractCommands } from './commands/extract-commands'
import { bootstrap } from './core/bootstrap'
import { ServiceKeys } from './core/di/container'
import { CodeActionProvider } from './providers/code-action-provider'
import type { RefactoringService } from './services/refactoring-service'
import type { IVSCodeService } from './types'

/**
 * Extension activation function
 */
export const activate = (context: vscode.ExtensionContext): void => {
        // Bootstrap dependency injection container
        const container = bootstrap()

        // Get services
        const refactoringService = container.get<RefactoringService>(
                'refactoring.service',
        )
        const vscodeService = container.get<IVSCodeService>(
                ServiceKeys.VSCodeService,
        )

        // Register code actions provider
        context.subscriptions.push(
                vscodeService.registerCodeActionsProvider(
                        { pattern: '**/*.{js,jsx,ts,tsx}', scheme: 'file' },
                        new CodeActionProvider(
                                refactoringService,
                                vscodeService,
                        ),
                ),
        )

        // Register commands
        registerExtractCommands(context, refactoringService, vscodeService)
}
