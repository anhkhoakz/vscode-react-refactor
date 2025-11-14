/**
 * Refactoring Strategy Pattern Implementation
 */

import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { wrapError } from '../../core/errors'
import {
        codeFromNode,
        isFunctionBinding,
        isPathInRange,
        isPathRemoved,
} from '../../lib/ast'
import type {
        ExtractionContext,
        IASTService,
        IComponentGeneratorFactory,
        IRefactoringStrategy,
        IVSCodeService,
        RefactoringType,
        RefactorResult,
} from '../../types'
import { ErrorCode, RefactoringError } from '../../types'

/**
 * Base refactoring strategy
 */
export abstract class BaseRefactoringStrategy implements IRefactoringStrategy {
        constructor(
                protected readonly astService: IASTService,
                protected readonly componentFactory: IComponentGeneratorFactory,
                protected readonly vscodeService: IVSCodeService,
        ) {}

        abstract execute(context: ExtractionContext): Promise<RefactorResult>
        abstract canHandle(type: RefactoringType): boolean

        /**
         * Execute the core extraction logic
         */
        protected async executeExtraction(
                context: ExtractionContext,
        ): Promise<RefactorResult> {
                return wrapError(
                        async () => {
                                const { name, code, start, end, produceClass } =
                                        context

                                let selectionCode = code.substring(start, end)

                                if (!this.astService.isJSX(selectionCode)) {
                                        throw new RefactoringError(
                                                ErrorCode.INVALID_JSX,
                                                'Invalid JSX selected',
                                        )
                                }

                                if (!this.astService.jsxToAst(selectionCode)) {
                                        selectionCode = `<div>${selectionCode}</div>`
                                }

                                const ast = this.astService.codeToAst(code)
                                const selectedPath =
                                        this.astService.findSelectedJSXElement(
                                                ast,
                                                start,
                                                end,
                                        )

                                if (!selectedPath) {
                                        throw new RefactoringError(
                                                ErrorCode.INVALID_JSX,
                                                'Invalid JSX selected',
                                        )
                                }

                                const parentPath =
                                        this.astService.findParentComponent(
                                                selectedPath,
                                        )
                                const referencePaths =
                                        this.astService.findComponentMemberReferences(
                                                parentPath,
                                                selectedPath,
                                        )

                                const paths = referencePaths.filter(
                                        isPathInRange(start, end),
                                )

                                const passedProps: Record<string, t.Node> = {}
                                const keyAttribute =
                                        this.copyAndRemoveKeyAttribute(
                                                selectedPath,
                                        )
                                if (keyAttribute) {
                                        passedProps.key = keyAttribute
                                }

                                const objects = this.getContainerObjects(paths)

                                paths.filter(
                                        (path) => !isPathRemoved(path),
                                ).forEach((path) => {
                                        const expression = codeFromNode(
                                                path.node,
                                        )
                                        let propName: string
                                        let container:
                                                | {
                                                          property: string
                                                          object: string
                                                  }
                                                | undefined

                                        if (path.isMemberExpression()) {
                                                if (isFunctionBinding(path)) {
                                                        const parent =
                                                                path.parentPath
                                                        if (
                                                                parent &&
                                                                t.isCallExpression(
                                                                        parent.node,
                                                                ) &&
                                                                t.isMemberExpression(
                                                                        parent
                                                                                .node
                                                                                .callee,
                                                                ) &&
                                                                t.isMemberExpression(
                                                                        parent
                                                                                .node
                                                                                .callee
                                                                                .object,
                                                                ) &&
                                                                t.isIdentifier(
                                                                        parent
                                                                                .node
                                                                                .callee
                                                                                .object
                                                                                .property,
                                                                )
                                                        ) {
                                                                propName =
                                                                        parent
                                                                                .node
                                                                                .callee
                                                                                .object
                                                                                .property
                                                                                .name
                                                        } else {
                                                                propName =
                                                                        'prop'
                                                        }
                                                } else if (
                                                        t.isMemberExpression(
                                                                path.node,
                                                        ) &&
                                                        t.isIdentifier(
                                                                path.node
                                                                        .property,
                                                        )
                                                ) {
                                                        propName =
                                                                path.node
                                                                        .property
                                                                        .name
                                                        container =
                                                                objects.find(
                                                                        (o) =>
                                                                                expression.startsWith(
                                                                                        o.object,
                                                                                ),
                                                                )
                                                } else {
                                                        propName = 'prop'
                                                }
                                        } else if (t.isIdentifier(path.node)) {
                                                propName = path.node.name
                                        } else {
                                                propName = 'prop'
                                        }

                                        if (container) {
                                                propName =
                                                        this.matchRouteInObject(
                                                                container,
                                                                expression,
                                                        )
                                                if (
                                                        !passedProps[
                                                                container
                                                                        .property
                                                        ]
                                                ) {
                                                        passedProps[
                                                                container.property
                                                        ] = t.identifier(
                                                                container.object,
                                                        )
                                                }
                                        } else {
                                                propName =
                                                        this.ensurePropertyIsUnique(
                                                                passedProps,
                                                                propName,
                                                                expression,
                                                        )
                                                if (!passedProps[propName]) {
                                                        passedProps[propName] =
                                                                t.cloneDeep(
                                                                        path.node,
                                                                )
                                                }
                                        }

                                        path.replaceWith(
                                                this.createPropsExpression(
                                                        produceClass,
                                                        propName,
                                                ),
                                        )
                                })

                                const extractedJSX = codeFromNode(
                                        selectedPath.node,
                                )

                                const config =
                                        this.vscodeService.getConfiguration()
                                const functionTypeConfig: string =
                                        config.get(
                                                'vscodeReactRefactor.functionType',
                                        ) || 'function'

                                const componentType: import('../../types').ComponentType =
                                        produceClass
                                                ? 'class'
                                                : functionTypeConfig ===
                                                    'arrowFunction'
                                                  ? 'arrowFunction'
                                                  : 'function'

                                const createComponent =
                                        this.componentFactory.create(
                                                componentType,
                                        )

                                const replaceJSXCode = codeFromNode(
                                        this.createJSXElement(
                                                name,
                                                passedProps,
                                        ),
                                )
                                const componentCode = createComponent(
                                        name,
                                        extractedJSX,
                                )
                                const insertAt =
                                        this.getComponentStartAt(parentPath)

                                return {
                                        replaceJSXCode,
                                        componentCode,
                                        insertAt,
                                }
                        },
                        ErrorCode.EXTRACTION_ERROR,
                        'Failed to execute extraction',
                )
        }

        private copyAndRemoveKeyAttribute(
                jsxElementPath: NodePath<t.JSXElement>,
        ): t.Node | undefined {
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
                return undefined
        }

        private getContainerObjects(
                paths: NodePath[],
        ): { object: string; property: string }[] {
                const objectMap: Record<string, number> = {}

                paths.filter(
                        (path) =>
                                (t.isMemberExpression(path.node) &&
                                        !t.isThisExpression(
                                                path.node.object,
                                        )) ||
                                !t.isMemberExpression(path.node),
                ).forEach((path) => {
                        const nodeToConvert = t.isMemberExpression(path.node)
                                ? path.node.object
                                : path.node
                        const object = codeFromNode(
                                nodeToConvert as import('@babel/types').Node,
                        )
                        objectMap[object] = (objectMap[object] || 0) + 1
                })

                // Filter objects that appear more than once
                const filteredMap = Object.fromEntries(
                        Object.entries(objectMap).filter(
                                ([key, val]) =>
                                        typeof val === 'number' &&
                                        val > 1 &&
                                        !this.isPropsObject(key),
                        ),
                )

                // Remove nested objects
                const finalMap = Object.fromEntries(
                        Object.entries(filteredMap).filter(
                                ([key]) =>
                                        !Object.keys(filteredMap).some(
                                                (k) =>
                                                        k !== key &&
                                                        key.startsWith(`${k}.`),
                                        ),
                        ),
                )

                return Object.keys(finalMap).map((object) => ({
                        object,
                        property: object.slice(object.lastIndexOf('.') + 1),
                }))
        }

        private getComponentStartAt(path: NodePath): number {
                if (
                        path.node.leadingComments?.length &&
                        path.node.leadingComments[0].start
                ) {
                        return path.node.leadingComments[0].start
                }
                return path.node.start ?? 0
        }

        private ensurePropertyIsUnique(
                propsMap: Record<string, t.Node>,
                name: string,
                value: string,
        ): string {
                if (!propsMap[name] || codeFromNode(propsMap[name]) === value) {
                        return name
                }
                return this.ensurePropertyIsUnique(propsMap, `_${name}`, value)
        }

        private matchRouteInObject(
                object: { object: string; property: string },
                childObject: string,
        ): string {
                return [
                        object.property,
                        childObject.slice(object.object.length + 1),
                ]
                        .filter((o) => !!o)
                        .join('.')
        }

        private isPropsObject(expressionCode: string): boolean {
                return (
                        expressionCode === 'this.props' ||
                        expressionCode === 'this.state' ||
                        expressionCode === 'props'
                )
        }

        private createPropsExpression(
                produceClass: boolean,
                propertyName: string,
        ): t.Node {
                return produceClass
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
        }

        private createJSXElement(
                name: string,
                attributes: Record<string, t.Node>,
        ): t.JSXElement {
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
                                                t.jsxExpressionContainer(
                                                        attrValue,
                                                ),
                                        ),
                                )
                        }
                })

                return jsxElement
        }
}

/**
 * Extract to component strategy
 */
export class ExtractToComponentStrategy extends BaseRefactoringStrategy {
        canHandle(type: RefactoringType): boolean {
                return type === 'extract'
        }

        async execute(context: ExtractionContext): Promise<RefactorResult> {
                return this.executeExtraction(context)
        }
}

/**
 * Extract to file strategy
 */
export class ExtractToFileStrategy extends BaseRefactoringStrategy {
        canHandle(type: RefactoringType): boolean {
                return type === 'extractToFile'
        }

        async execute(context: ExtractionContext): Promise<RefactorResult> {
                // For now, use the same extraction logic
                // Future: add file creation logic
                return this.executeExtraction(context)
        }
}
