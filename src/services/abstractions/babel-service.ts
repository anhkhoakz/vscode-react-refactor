/**
 * Babel Service Abstraction Layer
 */

import type * as t from '@babel/types'
import { wrapErrorSync } from '../../core/errors'
import type { IBabelService, ParserOptions } from '../../types'
import { ErrorCode } from '../../types'

/**
 * Babel service implementation
 */
export class BabelService implements IBabelService {
        private _parse: typeof import('@babel/parser').parse | null = null
        private _template: typeof import('@babel/template').default | null =
                null
        private _generate: typeof import('@babel/generator').default | null =
                null
        private _t: typeof import('@babel/types') | null = null

        /**
         * Lazy load Babel parser
         */
        private getParser(): typeof import('@babel/parser').parse {
                if (!this._parse) {
                        this._parse = require('@babel/parser').parse
                }
                if (!this._parse) {
                        throw new Error('Failed to load Babel parser')
                }
                return this._parse
        }

        /**
         * Lazy load Babel template
         */
        private getTemplate(): typeof import('@babel/template').default {
                if (!this._template) {
                        this._template = require('@babel/template').default
                }
                if (!this._template) {
                        throw new Error('Failed to load Babel template')
                }
                return this._template
        }

        /**
         * Lazy load Babel generator
         */
        private getGenerator(): typeof import('@babel/generator').default {
                if (!this._generate) {
                        this._generate = require('@babel/generator').default
                }
                if (!this._generate) {
                        throw new Error('Failed to load Babel generator')
                }
                return this._generate
        }

        /**
         * Lazy load Babel types
         */
        private getTypes(): typeof import('@babel/types') {
                if (!this._t) {
                        this._t = require('@babel/types')
                }
                if (!this._t) {
                        throw new Error('Failed to load Babel types')
                }
                return this._t
        }

        /**
         * Parse code to AST
         */
        parse(code: string, options?: ParserOptions): t.File {
                return wrapErrorSync(
                        () => {
                                const parse = this.getParser()
                                const parserOptions = options || {
                                        plugins: ['jsx', 'typescript'],
                                        sourceType: 'module' as const,
                                }
                                return parse(
                                        code,
                                        parserOptions as import('@babel/parser').ParserOptions,
                                )
                        },
                        ErrorCode.PARSER_ERROR,
                        `Failed to parse code: ${code.substring(0, 50)}...`,
                )
        }

        /**
         * Generate code from AST
         */
        generate(ast: t.File): string {
                return wrapErrorSync(
                        () => {
                                const generate = this.getGenerator()
                                const result = generate(
                                        ast as unknown as Parameters<
                                                typeof generate
                                        >[0],
                                        {},
                                        '',
                                )
                                return result.code
                        },
                        ErrorCode.PARSER_ERROR,
                        'Failed to generate code from AST',
                )
        }

        /**
         * Create AST from template string
         */
        template(code: string): t.Statement | t.Statement[] | null {
                return wrapErrorSync(
                        () => {
                                const template = this.getTemplate()
                                const result = template.ast(code, {
                                        plugins: ['jsx', 'typescript'],
                                })
                                return result as t.Statement | t.Statement[] | null
                        },
                        ErrorCode.PARSER_ERROR,
                        `Failed to create AST from template: ${code.substring(0, 50)}...`,
                )
        }

        /**
         * Check if code is JSX
         */
        isJSX(code: string): boolean {
                const trimmed = code.trim()
                const firstChar = trimmed[0]
                const lastChar = trimmed[trimmed.length - 1]
                if (firstChar !== '<' || lastChar !== '>') {
                        return false
                }

                const ast = this.jsxToAst(code)
                if (!ast || Array.isArray(ast)) {
                        return false
                }

                const t = this.getTypes()
                const statement = ast as t.Statement
                if (t.isExpressionStatement(statement)) {
                        return t.isJSX(statement.expression)
                }
                return false
        }

        /**
         * Convert JSX code to AST
         */
        jsxToAst(code: string): t.Statement | t.Statement[] | false {
                try {
                        const result = this.template(code)
                        return result ?? false
                } catch (_error) {
                        return false
                }
        }
}
