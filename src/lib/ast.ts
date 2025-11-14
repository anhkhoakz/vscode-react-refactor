import type { NodePath } from '@babel/traverse'
import * as vscode from 'vscode'

// Lazy-loaded Babel modules - only loaded when actually needed
let _parse: typeof import('@babel/parser').parse | null = null
let _template: typeof import('@babel/template').default | null = null
let _generate: typeof import('@babel/generator').default | null = null
let _t: typeof import('@babel/types') | null = null

// Lazy load Babel parser
const getParser = () => {
        if (!_parse) {
                _parse = require('@babel/parser').parse
        }
        return _parse
}

// Lazy load Babel template
const getTemplate = () => {
        if (!_template) {
                _template = require('@babel/template').default
        }
        return _template
}

// Lazy load Babel generator
const getGenerator = () => {
        if (!_generate) {
                _generate = require('@babel/generator').default
        }
        return _generate
}

// Lazy load Babel types
const getTypes = () => {
        if (!_t) {
                _t = require('@babel/types')
        }
        return _t
}

// Cache parser options to avoid repeated VS Code config reads
let cachedParserOptions: import('@babel/parser').ParserOptions | null = null
let cachedConfigKey: string | null = null

// AST cache for document-level parsing (cleared on document change)
const astCache = new Map<
        string,
        { ast: import('@babel/types').File; timestamp: number }
>()
const AST_CACHE_TTL = 5000 // 5 seconds cache

const getParserOptions = (): import('@babel/parser').ParserOptions => {
        const config = vscode.workspace.getConfiguration()
        const pluginsConfig: string = config.get(
                'vscodeReactRefactor.babelPlugins',
        )

        // Return cached options if config hasn't changed
        if (cachedParserOptions && cachedConfigKey === pluginsConfig) {
                return cachedParserOptions
        }

        const plugins = pluginsConfig
                .split(',')
                .map((s) => s.trim())
                .filter(
                        (s) => !!s,
                ) as import('@babel/parser').ParserOptions['plugins']

        cachedParserOptions = {
                plugins,
                sourceType: 'module' as const,
        }
        cachedConfigKey = pluginsConfig

        // Clear AST cache when parser options change
        astCache.clear()

        return cachedParserOptions
}

// Clear AST cache when VS Code config changes
vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('vscodeReactRefactor.babelPlugins')) {
                cachedParserOptions = null
                cachedConfigKey = null
                astCache.clear()
        }
})

export const isDebugEnabled = () => {
        return vscode.workspace
                .getConfiguration()
                .get('vscodeReactRefactor.enableDebug')
}

export const codeToAst = (code: string) => {
        // Use cache for full document parsing (common case)
        const cacheKey = code.substring(0, 100) // Use first 100 chars as cache key
        const cached = astCache.get(cacheKey)
        const now = Date.now()

        if (cached && now - cached.timestamp < AST_CACHE_TTL) {
                // Verify it's the same code (simple length check)
                if (cached.ast.program.body.length > 0) {
                        return cached.ast
                }
        }

        const parse = getParser()
        const ast = parse(code, {
                startLine: 0,
                ...getParserOptions(),
        })

        // Cache full document ASTs (typically > 1000 chars)
        if (code.length > 1000) {
                astCache.set(cacheKey, { ast, timestamp: now })
                // Limit cache size
                if (astCache.size > 10) {
                        const oldestKey = Array.from(astCache.entries()).sort(
                                (a, b) => a[1].timestamp - b[1].timestamp,
                        )[0][0]
                        astCache.delete(oldestKey)
                }
        }

        return ast
}

export const jsxToAst = (code: string) => {
        try {
                return templateToAst(code)
        } catch (error) {
                if (isDebugEnabled())
                        vscode.window.showErrorMessage(error.message)

                return false
        }
}

export const templateToAst = (code: string) => {
        const template = getTemplate()
        const options = getParserOptions()
        // template.ast only accepts plugins, not full parser options
        // Cast plugins to the expected type
        return template.ast(code, {
                plugins: options.plugins as import('@babel/template').TemplateBuilderOptions['plugins'],
        })
}

export const isJSX = (code: string) => {
        const trimmed = code.trim()
        const firstChar = trimmed[0]
        const lastChar = trimmed[trimmed.length - 1]
        if (firstChar !== '<' || lastChar !== '>') return false

        const ast = jsxToAst(code)
        if (!ast || Array.isArray(ast)) return false
        const t = getTypes()
        // Cast ast to Statement to fix type compatibility
        const statement = ast as import('@babel/types').Statement
        if (t.isExpressionStatement(statement)) {
                return t.isJSX(statement.expression)
        }
        return false
}

export const astToCode = (ast: import('@babel/types').File) => {
        const generate = getGenerator()
        const result = generate(
                ast as unknown as Parameters<typeof generate>[0],
                {},
                '',
        )
        return result.code
}

export const codeFromNode = (node: import('@babel/types').Node) => {
        const t = getTypes()
        const generate = getGenerator()
        // Optimize: Generate code directly from expression instead of creating full File AST
        // This avoids creating unnecessary AST structure
        if (t.isExpression(node)) {
                // For expressions, generate directly without wrapping in File AST
                const result = generate(
                        node as unknown as Parameters<typeof generate>[0],
                        {},
                        '',
                )
                return result.code
        }
        // Fallback for non-expression nodes - create File AST (original behavior)
        // Most calls to codeFromNode are with expressions, so this path is rarely taken
        const body = [
                t.expressionStatement(
                        node as unknown as import('@babel/types').Expression,
                ),
        ]
        const ast = t.file(t.program(body), null, null)
        return astToCode(ast).slice(0, -1)
}

export const isOuterMemberExpression = (path) =>
        path.isMemberExpression() &&
        !isArrayFunctionCall(path) &&
        (!path.parentPath.isMemberExpression() ||
                isArrayFunctionCall(path.parentPath))

export const findOuterMemberExpression = (path) =>
        path.findParent(isOuterMemberExpression) || path

export const isArrayFunctionCall = (path) =>
        path.key === 'callee' &&
        ['map', 'filter', 'reduce'].indexOf(path.node.property.name) > -1

export const isFunctionBinding = (path) =>
        path.key === 'callee' && path.node.property.name === 'bind'

export const isPathInRange = (start: number, end: number) => (path: NodePath) =>
        path.node.start >= start && path.node.end <= end

export const isClassMemberExpression = ({ node }) => {
        const t = getTypes()
        return (
                t.isMemberExpression(node) &&
                (t.isThisExpression(node.object) ||
                        isClassMemberExpression({ node: node.object }))
        )
}

export const isPathRemoved = (path) => !!path.findParent((path) => path.removed)

export const getReferencePaths = (scope, node) => {
        const bindings = scope.bindings[node.name]
        if (bindings?.referencePaths) {
                return bindings.referencePaths
        }
        return []
}

export const getVariableReferences = (scope, declaration) => {
        const t = getTypes()
        const refs = []
        if (t.isIdentifier(declaration)) {
                getReferencePaths(scope, declaration).forEach((path) => {
                        if (path.node !== declaration) {
                                refs.push(findOuterMemberExpression(path))
                        }
                })
        } else {
                let nodes:
                        | (
                                  | import('@babel/types').Identifier
                                  | import('@babel/types').Pattern
                                  | null
                          )[]
                        | undefined

                if (t.isObjectPattern(declaration)) {
                        nodes = declaration.properties
                                .map(
                                        (
                                                property:
                                                        | import('@babel/types').ObjectProperty
                                                        | import('@babel/types').RestElement,
                                        ) =>
                                                t.isRestElement(property)
                                                        ? property.argument
                                                        : property.value,
                                )
                                .filter(
                                        (
                                                node,
                                        ): node is
                                                | import('@babel/types').Identifier
                                                | import('@babel/types').Pattern =>
                                                t.isIdentifier(node) ||
                                                t.isPattern(node),
                                )
                } else if (t.isArrayPattern(declaration)) {
                        nodes = declaration.elements
                                .map(
                                        (
                                                id:
                                                        | import('@babel/types').Identifier
                                                        | import('@babel/types').Pattern
                                                        | import('@babel/types').RestElement
                                                        | null,
                                        ) =>
                                                t.isRestElement(id)
                                                        ? id.argument
                                                        : id,
                                )
                                .filter(
                                        (
                                                node,
                                        ): node is
                                                | import('@babel/types').Identifier
                                                | import('@babel/types').Pattern =>
                                                node !== null &&
                                                (t.isIdentifier(node) ||
                                                        t.isPattern(node)),
                                )
                }
                if (nodes) {
                        nodes.forEach((node) => {
                                getReferencePaths(scope, node).forEach(
                                        (path) => {
                                                if (path.node !== node) {
                                                        refs.push(
                                                                findOuterMemberExpression(
                                                                        path,
                                                                ),
                                                        )
                                                }
                                        },
                                )
                        })
                }
        }
        return refs
}

/**
 * Find block scoped references for component members
 * @param componentPath
 * @param targetPath
 */
export const findComponentMemberReferences = (componentPath, targetPath) => {
        let paths = []

        const path = targetPath || componentPath

        if (componentPath.isClassDeclaration()) {
                path.traverse({
                        MemberExpression(path) {
                                if (
                                        isClassMemberExpression(path) &&
                                        isOuterMemberExpression(path)
                                ) {
                                        paths.push(path)
                                }
                        },
                })
        } else {
                const t = getTypes()
                if (
                        t.isArrowFunctionExpression(componentPath.node.init) &&
                        componentPath.node.init.params[0]
                ) {
                        paths = paths.concat(
                                getVariableReferences(
                                        componentPath.scope,
                                        componentPath.node.init.params[0],
                                ),
                        )
                } else if (
                        t.isFunctionDeclaration(componentPath.node) &&
                        componentPath.node.params[0]
                ) {
                        paths = paths.concat(
                                getVariableReferences(
                                        componentPath.scope,
                                        componentPath.node.params[0],
                                ),
                        )
                }
        }

        walkParents(
                path,
                (parentPath: NodePath) => parentPath.isBlockStatement(),
                (parentPath: NodePath) => {
                        parentPath.traverse({
                                VariableDeclaration(path) {
                                        path.node.declarations.forEach(
                                                (declaration) => {
                                                        paths = paths.concat(
                                                                getVariableReferences(
                                                                        parentPath.scope,
                                                                        declaration.id,
                                                                ),
                                                        )
                                                },
                                        )
                                },
                        })
                },
        )
        walkParents(
                path,
                (parentPath: NodePath) =>
                        parentPath.isArrowFunctionExpression(),
                (parentPath: NodePath) => {
                        const t = getTypes()
                        if (
                                t.isArrowFunctionExpression(parentPath.node) ||
                                t.isFunctionExpression(parentPath.node) ||
                                t.isFunctionDeclaration(parentPath.node)
                        ) {
                                parentPath.node.params.forEach((param) => {
                                        paths = paths.concat(
                                                getVariableReferences(
                                                        parentPath.scope,
                                                        param,
                                                ),
                                        )
                                })
                        }
                },
        )

        return paths
}

export const walkParents = (
        path: NodePath,
        condition: (path: NodePath) => boolean,
        callback: (path: NodePath) => void,
) => {
        const parentPath = path.findParent(condition)
        if (parentPath) {
                callback(parentPath)
                walkParents(parentPath, condition, callback)
        }
}
