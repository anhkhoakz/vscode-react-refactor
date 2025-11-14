/**
 * Refactoring Service - Main service for refactoring operations
 */

import * as path from 'node:path'
import { LinesAndColumns } from 'lines-and-columns'
import * as vscode from 'vscode'
import { wrapError } from '../core/errors'
import type {
        ExtractionContext,
        IASTService,
        IRefactoringStrategy,
        IVSCodeService,
        RefactoringType,
        RefactorResult,
} from '../types'
import { ErrorCode, RefactoringError } from '../types'

/**
 * Refactoring service implementation
 */
export class RefactoringService {
        constructor(
                private readonly vscodeService: IVSCodeService,
                private readonly astService: IASTService,
                private readonly strategies: IRefactoringStrategy[],
        ) {}

        /**
         * Extract JSX to component
         */
        async extractToComponent(produceClass: boolean = false): Promise<void> {
                return wrapError(
                        async () => {
                                const editor =
                                        this.vscodeService.requireActiveEditor()
                                await this.extractAndReplaceSelection(
                                        editor,
                                        produceClass,
                                )
                                await this.executeFormatCommand()
                                this.resetSelection(editor)
                        },
                        ErrorCode.EXTRACTION_ERROR,
                        'Failed to extract component',
                )
        }

        /**
         * Extract JSX to file
         */
        async extractToFile(): Promise<void> {
                return wrapError(
                        async () => {
                                const editor =
                                        this.vscodeService.requireActiveEditor()
                                const result =
                                        await this.extractAndReplaceSelection(
                                                editor,
                                                true,
                                        )
                                const document = editor.document

                                const documentDir = path.dirname(
                                        document.fileName,
                                )
                                const watcher =
                                        this.vscodeService.createFileSystemWatcher(
                                                path.join(
                                                        documentDir,
                                                        '*.{js,jsx,ts,tsx}',
                                                ),
                                        )

                                const disposable = watcher.onDidCreate(
                                        async (uri) => {
                                                disposable.dispose()
                                                await this.executeFormatCommand()
                                                const doc =
                                                        await this.vscodeService.openTextDocument(
                                                                uri,
                                                        )
                                                await this.vscodeService.showTextDocument(
                                                        doc,
                                                )
                                                await this.executeFormatCommand()
                                                const activeEditor =
                                                        this.vscodeService.getActiveEditor()
                                                if (activeEditor) {
                                                        this.ensureReactIsImported(
                                                                activeEditor,
                                                        )
                                                }
                                        },
                                )

                                const insertPos = document.positionAt(
                                        result.insertAt,
                                )
                                const cmpLines =
                                        result.componentCode.split(/\n/).length

                                const start = new vscode.Position(
                                        insertPos.line,
                                        0,
                                )
                                const end = new vscode.Position(
                                        insertPos.line + cmpLines,
                                        0,
                                )
                                const selection = new vscode.Selection(
                                        start,
                                        end,
                                )

                                await this.executeMoveToNewFileCodeAction(
                                        document,
                                        selection,
                                )
                        },
                        ErrorCode.EXTRACTION_ERROR,
                        'Failed to extract to file',
                )
        }

        /**
         * Check if code action is available
         */
        isCodeActionAvailable(code: string): boolean {
                return this.astService.isJSX(code)
        }

        /**
         * Execute extraction and replacement
         */
        private async extractAndReplaceSelection(
                editor: vscode.TextEditor,
                produceClass: boolean,
        ): Promise<RefactorResult> {
                const name = await this.askForName()
                if (!name) {
                        throw new RefactoringError(
                                ErrorCode.EXTRACTION_ERROR,
                                'Component name is required',
                        )
                }

                const document = editor.document
                const selection = editor.selection
                const documentText = document.getText()

                const [start, end] = this.getIndexesForSelection(
                        documentText,
                        selection,
                )

                const strategy = this.getStrategy('extract')
                const context: ExtractionContext = {
                        name,
                        code: documentText,
                        start,
                        end,
                        produceClass,
                }

                const result = await strategy.execute(context)
                const insertAtLine = document.positionAt(result.insertAt).line

                await editor.edit((edit) => {
                        edit.replace(selection, result.replaceJSXCode)
                        edit.insert(
                                new vscode.Position(insertAtLine, 0),
                                `${result.componentCode}\n\n`,
                        )
                })

                return result
        }

        /**
         * Ask for component name
         */
        private async askForName(): Promise<string | false> {
                const name = await this.vscodeService.showInputBox({
                        prompt: 'Component name',
                })
                if (!name) {
                        return false
                }
                return this.normalizeComponentName(name)
        }

        /**
         * Normalize component name
         */
        private normalizeComponentName(name: string): string {
                return name
                        .split(/[\s-_]+/)
                        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                        .join('')
        }

        /**
         * Reset selection
         */
        private resetSelection(editor: vscode.TextEditor): void {
                const pos = editor.selection.end
                editor.selection = new vscode.Selection(pos, pos)
        }

        /**
         * Execute format command
         */
        private executeFormatCommand(): Thenable<unknown> {
                return this.vscodeService.executeCommand(
                        'editor.action.formatDocument',
                )
        }

        /**
         * Get indexes for selection
         */
        private getIndexesForSelection(
                documentText: string,
                selection: vscode.Selection,
        ): [number, number] {
                const lines = new LinesAndColumns(documentText)
                const { start, end } = selection
                const startIndex = lines.indexForLocation({
                        line: start.line,
                        column: start.character,
                })
                const endIndex = lines.indexForLocation({
                        line: end.line,
                        column: end.character,
                })
                return [startIndex ?? 0, endIndex ?? 0]
        }

        /**
         * Ensure React is imported
         */
        private ensureReactIsImported(editor: vscode.TextEditor): void {
                const text = editor.document.getText()
                // Simple check for React import
                const hasReactImport =
                        text.includes('import') &&
                        (text.includes('react') ||
                                text.includes('React') ||
                                text.includes("from 'react'") ||
                                text.includes('from "react"'))

                if (!hasReactImport) {
                        editor.edit((edit) => {
                                edit.insert(
                                        new vscode.Position(0, 0),
                                        'import React from "react";\n',
                                )
                        })
                }
        }

        /**
         * Execute move to new file code action
         */
        private async executeMoveToNewFileCodeAction(
                document: vscode.TextDocument,
                rangeOrSelection: vscode.Range | vscode.Selection,
        ): Promise<unknown> {
                const codeAction = 'Move to a new file'
                return this.vscodeService.executeCommand(
                        '_typescript.applyRefactoring',
                        document,
                        document.fileName,
                        codeAction,
                        codeAction,
                        rangeOrSelection,
                )
        }

        /**
         * Get strategy for refactoring type
         */
        private getStrategy(type: RefactoringType): IRefactoringStrategy {
                const strategy = this.strategies.find((s) => s.canHandle(type))
                if (!strategy) {
                        throw new RefactoringError(
                                ErrorCode.EXTRACTION_ERROR,
                                `No strategy found for type: ${type}`,
                        )
                }
                return strategy
        }
}
