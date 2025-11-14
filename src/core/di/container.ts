/**
 * Dependency Injection Container
 */

import type { IServiceContainer } from '../../types'

type Factory<T> = () => T

/**
 * Simple dependency injection container implementation
 */
export class ServiceContainer implements IServiceContainer {
        private readonly services = new Map<string, unknown>()
        private readonly factories = new Map<string, Factory<unknown>>()
        private readonly singletons = new Map<string, unknown>()

        /**
         * Get a service instance
         */
        get<T>(key: string): T {
                // Check if singleton exists
                if (this.singletons.has(key)) {
                        return this.singletons.get(key) as T
                }

                // Check if factory exists
                const factory = this.factories.get(key)
                if (factory) {
                        const instance = factory() as T
                        return instance
                }

                // Check if direct service exists
                if (this.services.has(key)) {
                        return this.services.get(key) as T
                }

                throw new Error(`Service not found: ${key}`)
        }

        /**
         * Register a factory function
         */
        register<T>(key: string, factory: Factory<T>): void {
                this.factories.set(key, factory as Factory<unknown>)
        }

        /**
         * Register a singleton service
         */
        registerSingleton<T>(key: string, factory: Factory<T>): void {
                if (!this.singletons.has(key)) {
                        const instance = factory()
                        this.singletons.set(key, instance)
                }
        }

        /**
         * Register a direct service instance
         */
        registerInstance<T>(key: string, instance: T): void {
                this.services.set(key, instance)
        }

        /**
         * Check if a service is registered
         */
        has(key: string): boolean {
                return (
                        this.services.has(key) ||
                        this.factories.has(key) ||
                        this.singletons.has(key)
                )
        }

        /**
         * Clear all registered services
         */
        clear(): void {
                this.services.clear()
                this.factories.clear()
                this.singletons.clear()
        }
}

/**
 * Service keys for dependency injection
 */
export const ServiceKeys = {
        VSCodeService: 'vscode.service',
        BabelService: 'babel.service',
        ASTService: 'ast.service',
        ComponentGeneratorFactory: 'component.generator.factory',
        RefactoringStrategy: 'refactoring.strategy',
        Container: 'container',
} as const
