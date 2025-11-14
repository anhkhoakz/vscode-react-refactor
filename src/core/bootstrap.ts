/**
 * Bootstrap - Initialize dependency injection container
 */

import { ComponentGeneratorFactory } from '../core/factories/component-generator-factory'
import {
        ExtractToComponentStrategy,
        ExtractToFileStrategy,
} from '../core/strategies/refactoring-strategy'
import { BabelService } from '../services/abstractions/babel-service'
import { VSCodeService } from '../services/abstractions/vscode-service'
import { ASTService } from '../services/ast-service'
import { RefactoringService } from '../services/refactoring-service'
import type { IServiceContainer } from '../types'
import { ServiceContainer, ServiceKeys } from './di/container'

/**
 * Initialize and configure the dependency injection container
 */
export function bootstrap(): IServiceContainer {
        const container = new ServiceContainer()

        // Register container itself
        container.registerInstance(ServiceKeys.Container, container)

        // Register VSCode service (singleton)
        container.registerSingleton(ServiceKeys.VSCodeService, () => {
                return new VSCodeService()
        })

        // Register Babel service (singleton)
        container.registerSingleton(ServiceKeys.BabelService, () => {
                return new BabelService()
        })

        // Register AST service (singleton)
        container.registerSingleton(ServiceKeys.ASTService, () => {
                const babelService = container.get<
                        import('../services/abstractions/babel-service').BabelService
                >(ServiceKeys.BabelService)
                return new ASTService(babelService)
        })

        // Register component generator factory (singleton)
        container.registerSingleton(
                ServiceKeys.ComponentGeneratorFactory,
                () => {
                        return new ComponentGeneratorFactory()
                },
        )

        // Register refactoring strategies
        container.register(`${ServiceKeys.RefactoringStrategy}.extract`, () => {
                const astService = container.get<
                        import('../services/ast-service').ASTService
                >(ServiceKeys.ASTService)
                const componentFactory = container.get<
                        import('../core/factories/component-generator-factory').ComponentGeneratorFactory
                >(ServiceKeys.ComponentGeneratorFactory)
                const vscodeService = container.get<
                        import('../services/abstractions/vscode-service').VSCodeService
                >(ServiceKeys.VSCodeService)
                return new ExtractToComponentStrategy(
                        astService,
                        componentFactory,
                        vscodeService,
                )
        })

        container.register(
                `${ServiceKeys.RefactoringStrategy}.extractToFile`,
                () => {
                        const astService = container.get<
                                import('../services/ast-service').ASTService
                        >(ServiceKeys.ASTService)
                        const componentFactory = container.get<
                                import('../core/factories/component-generator-factory').ComponentGeneratorFactory
                        >(ServiceKeys.ComponentGeneratorFactory)
                        const vscodeService = container.get<
                                import('../services/abstractions/vscode-service').VSCodeService
                        >(ServiceKeys.VSCodeService)
                        return new ExtractToFileStrategy(
                                astService,
                                componentFactory,
                                vscodeService,
                        )
                },
        )

        // Register refactoring service (singleton)
        container.registerSingleton('refactoring.service', () => {
                const vscodeService = container.get<
                        import('../services/abstractions/vscode-service').VSCodeService
                >(ServiceKeys.VSCodeService)
                const astService = container.get<
                        import('../services/ast-service').ASTService
                >(ServiceKeys.ASTService)
                const extractStrategy =
                        container.get<ExtractToComponentStrategy>(
                                `${ServiceKeys.RefactoringStrategy}.extract`,
                        )
                const extractToFileStrategy =
                        container.get<ExtractToFileStrategy>(
                                ServiceKeys.RefactoringStrategy +
                                        '.extractToFile',
                        )
                return new RefactoringService(vscodeService, astService, [
                        extractStrategy,
                        extractToFileStrategy,
                ])
        })

        return container
}
