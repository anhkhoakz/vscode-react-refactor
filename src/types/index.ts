/**
 * Core type definitions for the React Refactor extension
 */

import type { NodePath } from '@babel/traverse'
import type * as t from '@babel/types'
import type * as vscode from 'vscode'

/**
 * Refactoring result containing the generated component code and replacement JSX
 */
export interface RefactorResult {
        replaceJSXCode: string
        componentCode: string
        insertAt: number
}

/**
 * Component generation function type
 */
export type ComponentGenerator = (name: string, renderCode: string) => string

/**
 * Component type options
 */
export type ComponentType = 'function' | 'arrowFunction' | 'class'

/**
 * Refactoring strategy type
 */
export type RefactoringType = 'extract' | 'extractToFile'

/**
 * Parser options configuration
 */
export interface ParserOptions {
        plugins: string[]
        sourceType: 'module' | 'script' | 'unambiguous'
}

/**
 * AST cache entry
 */
export interface ASTCacheEntry {
        ast: t.File
        timestamp: number
}

/**
 * Container object for member expressions
 */
export interface ContainerObject {
        object: string
        property: string
}

/**
 * Code action context
 */
export interface CodeActionContext {
        editor: vscode.TextEditor
        selection: vscode.Selection
        document: vscode.TextDocument
}

/**
 * Extraction context
 */
export interface ExtractionContext {
        name: string
        code: string
        start: number
        end: number
        produceClass: boolean
}

/**
 * Service container interface for dependency injection
 */
export interface IServiceContainer {
        get<T>(key: string): T
        register<T>(key: string, factory: () => T): void
        registerSingleton<T>(key: string, factory: () => T): void
}

/**
 * Babel abstraction interface
 */
export interface IBabelService {
        parse(code: string, options?: ParserOptions): t.File
        generate(ast: t.File): string
        template(code: string): t.Statement | t.Statement[] | null
        isJSX(code: string): boolean
        jsxToAst(code: string): t.Statement | t.Statement[] | false
}

/**
 * VSCode abstraction interface
 */
export interface IVSCodeService {
        getActiveEditor(): vscode.TextEditor | undefined
        requireActiveEditor(): vscode.TextEditor
        requireSelection(editor: vscode.TextEditor): vscode.Selection
        getConfiguration(): vscode.WorkspaceConfiguration
        showInputBox(
                options: vscode.InputBoxOptions,
        ): Thenable<string | undefined>
        showErrorMessage(message: string): void
        executeCommand(command: string, ...rest: unknown[]): Thenable<unknown>
        registerCommand(
                command: string,
                callback: (...args: unknown[]) => unknown,
        ): vscode.Disposable
        registerCodeActionsProvider(
                selector: vscode.DocumentSelector,
                provider: vscode.CodeActionProvider,
        ): vscode.Disposable
        createFileSystemWatcher(pattern: string): vscode.FileSystemWatcher
        openTextDocument(uri: vscode.Uri): Thenable<vscode.TextDocument>
        showTextDocument(document: vscode.TextDocument): Thenable<void>
}

/**
 * AST service interface
 */
export interface IASTService {
        codeToAst(code: string): t.File
        astToCode(ast: t.File): string
        codeFromNode(node: t.Node): string
        jsxToAst(code: string): t.Statement | t.Statement[] | false
        isJSX(code: string): boolean
        findSelectedJSXElement(
                ast: t.File,
                start: number,
                end: number,
        ): NodePath<t.JSXElement> | undefined
        findParentComponent(path: NodePath): NodePath
        findComponentMemberReferences(
                componentPath: NodePath,
                targetPath: NodePath,
        ): NodePath[]
}

/**
 * Component generator factory interface
 */
export interface IComponentGeneratorFactory {
        create(type: ComponentType): ComponentGenerator
}

/**
 * Refactoring strategy interface
 */
export interface IRefactoringStrategy {
        execute(context: ExtractionContext): Promise<RefactorResult>
        canHandle(type: RefactoringType): boolean
}

/**
 * Error codes for custom errors
 */
export enum ErrorCode {
        INVALID_JSX = 'INVALID_JSX',
        INVALID_COMPONENT = 'INVALID_COMPONENT',
        NO_EDITOR = 'NO_EDITOR',
        NO_SELECTION = 'NO_SELECTION',
        PARSER_ERROR = 'PARSER_ERROR',
        EXTRACTION_ERROR = 'EXTRACTION_ERROR',
        FILE_SYSTEM_ERROR = 'FILE_SYSTEM_ERROR',
}

/**
 * Custom error class for refactoring operations
 */
export class RefactoringError extends Error {
        constructor(
                public readonly code: ErrorCode,
                message: string,
                public readonly originalError?: Error,
        ) {
                super(message)
                this.name = 'RefactoringError'
                Object.setPrototypeOf(this, RefactoringError.prototype)
        }
}
