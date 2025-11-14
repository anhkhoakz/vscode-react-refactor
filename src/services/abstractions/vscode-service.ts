/**
 * VSCode Service Abstraction Layer
 */

import * as vscode from 'vscode'
import type { IVSCodeService } from '../../types'
import { ErrorCode, RefactoringError } from '../../types'

/**
 * VSCode service implementation
 */
export class VSCodeService implements IVSCodeService {
        /**
         * Get the active text editor
         */
        getActiveEditor(): vscode.TextEditor | undefined {
                return vscode.window.activeTextEditor
        }

        /**
         * Get workspace configuration
         */
        getConfiguration(): vscode.WorkspaceConfiguration {
                return vscode.workspace.getConfiguration()
        }

        /**
         * Show input box
         */
        showInputBox(
                options: vscode.InputBoxOptions,
        ): Thenable<string | undefined> {
                return vscode.window.showInputBox(options)
        }

        /**
         * Show error message
         */
        showErrorMessage(message: string): void {
                vscode.window.showErrorMessage(message)
        }

        /**
         * Execute a command
         */
        executeCommand(command: string, ...rest: unknown[]): Thenable<unknown> {
                return vscode.commands.executeCommand(command, ...rest)
        }

        /**
         * Register a command
         */
        registerCommand(
                command: string,
                callback: (...args: unknown[]) => unknown,
        ): vscode.Disposable {
                return vscode.commands.registerCommand(command, callback)
        }

        /**
         * Register a code actions provider
         */
        registerCodeActionsProvider(
                selector: vscode.DocumentSelector,
                provider: vscode.CodeActionProvider,
        ): vscode.Disposable {
                return vscode.languages.registerCodeActionsProvider(
                        selector,
                        provider,
                )
        }

        /**
         * Create a file system watcher
         */
        createFileSystemWatcher(pattern: string): vscode.FileSystemWatcher {
                return vscode.workspace.createFileSystemWatcher(pattern)
        }

        /**
         * Open a text document
         */
        openTextDocument(uri: vscode.Uri): Thenable<vscode.TextDocument> {
                return vscode.workspace.openTextDocument(uri)
        }

        /**
         * Show a text document
         */
        showTextDocument(document: vscode.TextDocument): Thenable<void> {
                return vscode.window.showTextDocument(document).then(() => {
                        // Return void
                })
        }

        /**
         * Validate editor exists
         */
        requireActiveEditor(): vscode.TextEditor {
                const editor = this.getActiveEditor()
                if (!editor) {
                        throw new RefactoringError(
                                ErrorCode.NO_EDITOR,
                                'No active editor found',
                        )
                }
                return editor
        }

        /**
         * Validate selection exists
         */
        requireSelection(editor: vscode.TextEditor): vscode.Selection {
                if (editor.selection.isEmpty) {
                        throw new RefactoringError(
                                ErrorCode.NO_SELECTION,
                                'No selection found',
                        )
                }
                return editor.selection
        }
}
