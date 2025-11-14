/**
 * Component Generator Factory
 */

import {
        generateArrowFunctionComponent,
        generateClassComponent,
        generateFunctionalComponent,
} from '../../utils'
import type {
        ComponentGenerator,
        ComponentType,
        IComponentGeneratorFactory,
} from '../../types'

/**
 * Component generator factory implementation
 */
export class ComponentGeneratorFactory implements IComponentGeneratorFactory {
        /**
         * Create a component generator based on type
         */
        create(type: ComponentType): ComponentGenerator {
                switch (type) {
                        case 'class':
                                return generateClassComponent
                        case 'arrowFunction':
                                return generateArrowFunctionComponent
                        default:
                                return generateFunctionalComponent
                }
        }
}
