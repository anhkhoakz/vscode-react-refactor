/**
 * AST Service - Business logic for AST operations
 */

import traverse, { type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'
import { findComponentMemberReferences } from '../lib/ast'
import type { IASTService, IBabelService } from '../types'
import { ErrorCode, RefactoringError } from '../types'

/**
 * AST Service implementation
 */
export class ASTService implements IASTService {
        private readonly astCache = new Map<
                string,
                { ast: t.File; timestamp: number }
        >()
        private readonly AST_CACHE_TTL = 5000 // 5 seconds

        constructor(private readonly babelService: IBabelService) {}

        /**
         * Convert code to AST
         */
        codeToAst(code: string): t.File {
                // Use cache for full document parsing
                const cacheKey = code.substring(0, 100)
                const cached = this.astCache.get(cacheKey)
                const now = Date.now()

                if (cached && now - cached.timestamp < this.AST_CACHE_TTL) {
                        if (cached.ast.program.body.length > 0) {
                                return cached.ast
                        }
                }

                const ast = this.babelService.parse(code)

                // Cache full document ASTs
                if (code.length > 1000) {
                        this.astCache.set(cacheKey, { ast, timestamp: now })
                        // Limit cache size
                        if (this.astCache.size > 10) {
                                const oldestKey = Array.from(
                                        this.astCache.entries(),
                                ).sort(
                                        (a, b) =>
                                                a[1].timestamp - b[1].timestamp,
                                )[0][0]
                                this.astCache.delete(oldestKey)
                        }
                }

                return ast
        }

        /**
         * Convert AST to code
         */
        astToCode(ast: t.File): string {
                return this.babelService.generate(ast)
        }

        /**
         * Generate code from a node
         */
        codeFromNode(node: t.Node): string {
                // Use dynamic import to avoid circular dependencies
                const t =
                        require('@babel/types') as typeof import('@babel/types')
                const generateFn = require('@babel/generator')
                        .default as typeof import('@babel/generator').default

                // For expressions, generate directly without wrapping in File AST
                if (t.isExpression(node)) {
                        const result = generateFn(
                                node as unknown as Parameters<
                                        typeof generateFn
                                >[0],
                                {},
                                '',
                        )
                        return result.code
                }
                // For non-expression nodes, create a File AST
                const body = [
                        t.expressionStatement(node as unknown as t.Expression),
                ]
                const ast = t.file(t.program(body), null, null)
                return this.babelService.generate(ast).slice(0, -1)
        }

        /**
         * Convert JSX to AST
         */
        jsxToAst(code: string): t.Statement | t.Statement[] | false {
                return this.babelService.jsxToAst(code)
        }

        /**
         * Check if code is JSX
         */
        isJSX(code: string): boolean {
                return this.babelService.isJSX(code)
        }

        /**
         * Find selected JSX element in AST
         */
        findSelectedJSXElement(
                ast: t.File,
                start: number,
                end: number,
        ): NodePath<t.JSXElement> | undefined {
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
         * Find parent component
         */
        findParentComponent(path: NodePath): NodePath {
                const parentPath = path.findParent(
                        (p) =>
                                p.isClassDeclaration() ||
                                p.isVariableDeclarator() ||
                                p.isFunctionDeclaration(),
                )

                if (!parentPath) {
                        throw new RefactoringError(
                                ErrorCode.INVALID_COMPONENT,
                                'Invalid component: no parent component found',
                        )
                }

                return parentPath
        }

        /**
         * Find component member references
         */
        findComponentMemberReferences(
                componentPath: NodePath,
                targetPath: NodePath,
        ): NodePath[] {
                return findComponentMemberReferences(componentPath, targetPath)
        }

        /**
         * Clear AST cache
         */
        clearCache(): void {
                this.astCache.clear()
        }
}
