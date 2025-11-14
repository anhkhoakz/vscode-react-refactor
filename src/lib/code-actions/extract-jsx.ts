import * as path from 'node:path'
import traverse, { type NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import * as vscode from 'vscode'

// import pickBy = require('lodash.pickby')

import { LinesAndColumns } from 'lines-and-columns'
import {
        codeFromNode,
        codeToAst,
        findComponentMemberReferences,
        isDebugEnabled,
        isFunctionBinding,
        isJSX,
        isPathInRange,
        isPathRemoved,
        jsxToAst,
} from '../ast'
import {
        askForName,
        generateArrowFunctionComponent,
        generateClassComponent,
        generateFunctionalComponent,
} from '../utils'

/**
 * Extract code to new React component
 * @param {boolean} produceClass
 */
export const extractToComponent = async (produceClass: boolean = false) => {
        const editor = vscode.window.activeTextEditor
        try {
                await extractAndReplaceSelection(editor, produceClass)
                await executeFormatCommand()
                resetSelection(editor)
        } catch (error) {
                if (isDebugEnabled())
                        vscode.window.showErrorMessage(error.message)
        }
}

const pickBy = (
        object: Record<string, unknown>,
        predicate: (value: unknown, key: string) => boolean,
): Record<string, unknown> => {
        return Object.fromEntries(
                Object.entries(object).filter(([key, value]) =>
                        predicate(value, key),
                ),
        ) as Record<string, unknown>
}

/**
 * Extract code to file action
 */
export const extractToFile = async () => {
        const editor = vscode.window.activeTextEditor

        try {
                const result = await extractAndReplaceSelection(editor, true)
                const document = editor.document

                const documentDir = path.dirname(editor.document.fileName)
                const watcher = vscode.workspace.createFileSystemWatcher(
                        path.join(documentDir, '*.{js,jsx,ts,tsx}'),
                )

                const disposable = watcher.onDidCreate(async (uri) => {
                        disposable.dispose()
                        await executeFormatCommand()
                        const document =
                                await vscode.workspace.openTextDocument(uri)
                        await vscode.window.showTextDocument(document)
                        await executeFormatCommand()
                        ensureReactIsImported(vscode.window.activeTextEditor)
                })

                const insertPos = document.positionAt(result.insertAt)
                const cmpLines = result.componentCode.split(/\n/).length

                const start = new vscode.Position(insertPos.line, 0)
                const end = new vscode.Position(insertPos.line + cmpLines, 0)
                const selection = new vscode.Selection(start, end)

                await executeMoveToNewFileCodeAction(editor.document, selection)
        } catch (error) {
                if (isDebugEnabled())
                        vscode.window.showErrorMessage(error.message)
        }
}

/**
 * @param {vscode.TextEditor} editor
 */
const resetSelection = (editor: vscode.TextEditor) => {
        const pos = editor.selection.end
        editor.selection = new vscode.Selection(pos, pos)
}

/**
 * Check if code action is available
 *
 * @param code
 */
export const isCodeActionAvailable = (code: string): boolean => {
        return isJSX(code)
}

export const executeFormatCommand = () =>
        vscode.commands.executeCommand('editor.action.formatDocument')

/**
 * Extract selected JSX to a new React component
 *
 * @param editor
 * @param produceClass
 */
const extractAndReplaceSelection = async (
        editor: vscode.TextEditor,
        produceClass: boolean = false,
): Promise<RefactorResult> => {
        if (!editor) {
                return
        }

        const name = await askForName()
        if (!name) {
                return
        }

        const document = editor.document
        const selection = editor.selection
        const documentText = document.getText()

        const [start, end] = getIndexesForSelection(documentText, selection)
        const result = executeCodeAction(
                name,
                documentText,
                start,
                end,
                produceClass,
        )
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
 * Execute otb code action provided by TypeScript language server
 *
 * @param document
 * @param rangeOrSelection
 */
const executeMoveToNewFileCodeAction = async (
        document: vscode.TextDocument,
        rangeOrSelection: vscode.Range | vscode.Selection,
) => {
        const codeAction = 'Move to a new file'
        //     const args = {
        //         file: document.fileName,
        //         refactor: codeAction,
        //         action: codeAction,
        //         startLine: rangeOrSelection.start.line + 1,
        //         startOffset: rangeOrSelection.start.character + 1,
        //         endLine: rangeOrSelection.end.line + 1,
        //         endOffset: rangeOrSelection.end.character + 1
        //     };

        //   await vscode.commands.executeCommand('_typescript.applyCodeActionCommand', args);

        return vscode.commands.executeCommand(
                '_typescript.applyRefactoring',
                document,
                document.fileName,
                codeAction,
                codeAction,
                rangeOrSelection,
        )
}

/**
 * Get start and end index of selection or range
 *
 * @param documentText
 * @param selectionOrRange
 */
const getIndexesForSelection = (
        documentText: string,
        selectionOrRange: vscode.Selection,
): number[] => {
        const lines = new LinesAndColumns(documentText)
        const { start, end } = selectionOrRange
        const startIndex = lines.indexForLocation({
                line: start.line,
                column: start.character,
        })
        const endIndex = lines.indexForLocation({
                line: end.line,
                column: end.character,
        })
        return [startIndex, endIndex]
}

/**
 * Check is React imported to document and if not import
 *
 * @param editor
 */
const ensureReactIsImported = (editor: vscode.TextEditor) => {
        const ast = codeToAst(editor.document.getText())
        let matched = false
        traverse(ast as unknown as Parameters<typeof traverse>[0], {
                ImportDeclaration(path) {
                        if (path.node.source.value === 'react') {
                                matched = true
                                path.stop()
                        }
                },
        })
        if (!matched) {
                editor.edit((edit) => {
                        edit.insert(
                                new vscode.Position(0, 0),
                                'import React from "react";\n',
                        )
                })
        }
}

/**
 * Extraction Result Type
 */
type RefactorResult = {
        replaceJSXCode: string
        componentCode: string
        insertAt: number
}

/**
 * Execute code action
 *
 * @param name
 * @param code
 * @param start
 * @param end
 * @param produceClass
 */
const executeCodeAction = (
        name: string,
        code: string,
        start: number,
        end: number,
        produceClass: boolean = false,
): RefactorResult => {
        let selectionCode = code.substring(start, end)

        if (!isJSX(selectionCode)) {
                throw new Error('Invalid JSX selected;')
        }

        if (!jsxToAst(selectionCode)) {
                selectionCode = `<div>${selectionCode}</div>`
                code =
                        code.substring(0, start) +
                        selectionCode +
                        code.substring(end)
                end = start + selectionCode.length
        }

        const ast = codeToAst(code)

        const selectedPath = findSelectedJSXElement(ast, start, end)
        if (!selectedPath) {
                throw new Error('Invalid JSX selected')
        }

        const parentPath = findParentComponent(selectedPath as NodePath)
        const referencePaths = findComponentMemberReferences(
                parentPath,
                selectedPath as NodePath,
        )

        const paths = referencePaths.filter(isPathInRange(start, end))

        const passedProps: Record<string, t.Node> = {}

        const keyAttribute = copyAndRemoveKeyAttribute(selectedPath)
        if (keyAttribute) {
                passedProps.key = keyAttribute
        }

        const objects = getContainerObjects(paths)

        paths.filter((path) => !isPathRemoved(path)).forEach((path) => {
                const expression = codeFromNode(path.node)
                let propName: string
                let container: { property: string; object: string } | undefined

                if (path.isMemberExpression()) {
                        if (isFunctionBinding(path)) {
                                path = path.parentPath
                                propName = path.node.callee.object.property.name
                        } else {
                                propName = path.node.property.name
                                container = objects.find((o) =>
                                        expression.startsWith(o.object),
                                )
                        }
                } else {
                        propName = path.node.name
                }

                if (container) {
                        propName = matchRouteInObject(container, expression)
                        if (!passedProps[container.property]) {
                                passedProps[container.property] = t.identifier(
                                        container.object,
                                )
                        }
                } else {
                        propName = ensurePropertyIsUnique(
                                passedProps,
                                propName,
                                expression,
                        )
                        if (!passedProps[propName]) {
                                passedProps[propName] = t.cloneDeep(path.node)
                        }
                }

                path.replaceWith(createPropsExpression(produceClass, propName))
        })

        const extractedJSX = codeFromNode(selectedPath.node)

        const functionTypeConfig: string = vscode.workspace
                .getConfiguration()
                .get('vscodeReactRefactor.functionType')

        const createComponent = produceClass
                ? generateClassComponent
                : functionTypeConfig === 'arrowFunction'
                  ? generateArrowFunctionComponent
                  : generateFunctionalComponent

        const replaceJSXCode = codeFromNode(createJSXElement(name, passedProps))
        const componentCode = createComponent(name, extractedJSX)
        const insertAt = getComponentStartAt(parentPath)

        return {
                replaceJSXCode,
                componentCode,
                insertAt,
        }
}

/**
 * Find parent component class or arrow function declarator
 *
 * @param path
 */
const findParentComponent = (path: NodePath) => {
        const parentPath = path.findParent(
                (path) =>
                        path.isClassDeclaration() ||
                        path.isVariableDeclarator() ||
                        path.isFunctionDeclaration(),
        )
        if (!parentPath) {
                throw new Error('Invalid component')
        }
        return parentPath
}

/**
 * Find the frist path in a range
 * @param ast
 * @param start
 * @param end
 */
const findSelectedJSXElement = (ast: t.File, start: number, end: number) => {
        let selectedPath: NodePath<t.JSXElement> | undefined
        traverse(ast as unknown as Parameters<typeof traverse>[0], {
                JSXElement(path) {
                        if (
                                path.node.start &&
                                path.node.end &&
                                path.node.start >= start &&
                                path.node.end <= end
                        ) {
                                selectedPath =
                                        path as unknown as NodePath<t.JSXElement>
                                path.stop()
                        }
                },
        })
        return selectedPath
}

/**
 * Find common container objects from a list of member expressions
 * @param paths
 */
const getContainerObjects = (
        paths: NodePath[],
): { object: string; property: string }[] => {
        let objectMap = {}
        paths.filter(
                (path) =>
                        (t.isMemberExpression(path.node) &&
                                !t.isThisExpression(path.node.object)) ||
                        !t.isMemberExpression(path.node),
        ).forEach((path) => {
                const nodeToConvert = t.isMemberExpression(path.node)
                        ? path.node.object
                        : path.node
                const object = codeFromNode(
                        nodeToConvert as import('@babel/types').Node,
                )
                objectMap[object] = objectMap[object] || 0
                objectMap[object]++
        })
        objectMap = pickBy(
                objectMap,
                (val: unknown, key: string) =>
                        typeof val === 'number' &&
                        val > 1 &&
                        !isPropsObject(key),
        )
        objectMap = pickBy(
                objectMap,
                (_val, key) => !objectMap[key.slice(0, key.lastIndexOf('.'))],
        )
        return Object.keys(objectMap).map((object) => ({
                object,
                property: object.slice(object.lastIndexOf('.') + 1),
        }))
}

const getComponentStartAt = (path: NodePath) => {
        if (
                path.node.leadingComments?.length &&
                path.node.leadingComments[0].start
        ) {
                return path.node.leadingComments[0].start
        }
        return path.node.start ?? 0
}

const ensurePropertyIsUnique = (
        propsMap: Record<string, t.Node>,
        name: string,
        value: string,
) => {
        if (!propsMap[name] || codeFromNode(propsMap[name]) === value) {
                return name
        }
        return ensurePropertyIsUnique(propsMap, `_${name}`, value)
}

const matchRouteInObject = (
        object: { object: string; property: string },
        childObject: string,
) =>
        [object.property, childObject.slice(object.object.length + 1)]
                .filter((o) => !!o)
                .join('.')

const isPropsObject = (expressionCode: string) =>
        expressionCode === 'this.props' ||
        expressionCode === 'this.state' ||
        expressionCode === 'props'

const createPropsExpression = (produceClass, propertyName: string) =>
        produceClass
                ? t.memberExpression(
                          t.memberExpression(
                                  t.thisExpression(),
                                  t.identifier('props'),
                          ),
                          t.identifier(propertyName),
                  )
                : t.memberExpression(
                          t.identifier('props'),
                          t.identifier(propertyName),
                  )

const createJSXElement = (name: string, attributes: Record<string, t.Node>) => {
        const jsxElement = t.jsxElement(
                t.jsxOpeningElement(t.jsxIdentifier(name), []),
                t.jsxClosingElement(t.jsxIdentifier(name)),
                [],
                true,
        )
        Object.keys(attributes).forEach((id) => {
                const attrValue = attributes[id]
                if (
                        t.isExpression(attrValue) ||
                        t.isJSXEmptyExpression(attrValue)
                ) {
                        jsxElement.openingElement.attributes.push(
                                t.jsxAttribute(
                                        t.jsxIdentifier(id),
                                        t.jsxExpressionContainer(attrValue),
                                ),
                        )
                }
        })
        return jsxElement
}

const copyAndRemoveKeyAttribute = (
        jsxElementPath: NodePath<t.JSXElement>,
): t.Node | undefined => {
        if (!jsxElementPath.isJSXElement()) {
                return undefined
        }
        const openingElement = jsxElementPath.node.openingElement
        let keyAttributePath: NodePath<t.JSXAttribute> | undefined
        jsxElementPath.traverse({
                JSXAttribute(path) {
                        if (
                                t.isJSXIdentifier(path.node.name) &&
                                path.node.name.name === 'key' &&
                                path.parentPath.node === openingElement
                        ) {
                                keyAttributePath =
                                        path as NodePath<t.JSXAttribute>
                        }
                },
        })
        if (
                keyAttributePath &&
                t.isJSXExpressionContainer(keyAttributePath.node.value)
        ) {
                const value = t.cloneDeep(
                        keyAttributePath.node.value.expression,
                )
                keyAttributePath.remove()
                return value
        }
}
