/**
 * Code Action Provider - VSCode provider for code actions
 */

import type * as vscode from 'vscode'
import type { RefactoringService } from '../services/refactoring-service'
import type { IVSCodeService } from '../types'

/**
 * Code Action Provider using the new architecture
 */
export class CodeActionProvider implements vscode.CodeActionProvider {
	constructor(
		private readonly refactoringService: RefactoringService,
		private readonly vscodeService: IVSCodeService,
	) {}

	public provideCodeActions(): vscode.Command[] {
		const editor = this.vscodeService.getActiveEditor()
		if (!editor || editor.selection.isEmpty) {
			return []
		}

		const selectedText = editor.document.getText(editor.selection)
		const codeActions: vscode.Command[] = []

		if (
			this.refactoringService.isCodeActionAvailable(
				selectedText,
			)
		) {
			codeActions.push({
				command: 'extension.react-refactor.extractToFunction',
				title: 'Extract JSX to Functional Component',
			})
			codeActions.push({
				command: 'extension.react-refactor.extractToClass',
				title: 'Extract JSX to Class Component',
			})
		}

		return codeActions
	}
}
