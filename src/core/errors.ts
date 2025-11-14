/**
 * Error handling utilities and custom error classes
 */

import { ErrorCode, RefactoringError } from '../types'

/**
 * Wrap an async function with error handling
 */
export async function wrapError<T>(
        fn: () => Promise<T>,
        errorCode: ErrorCode,
        errorMessage: string,
): Promise<T> {
        try {
                return await fn()
        } catch (error) {
                if (error instanceof RefactoringError) {
                        throw error
                }
                throw new RefactoringError(
                        errorCode,
                        errorMessage,
                        error instanceof Error
                                ? error
                                : new Error(String(error)),
                )
        }
}

/**
 * Wrap a synchronous function with error handling
 */
export function wrapErrorSync<T>(
        fn: () => T,
        errorCode: ErrorCode,
        errorMessage: string,
): T {
        try {
                return fn()
        } catch (error) {
                if (error instanceof RefactoringError) {
                        throw error
                }
                throw new RefactoringError(
                        errorCode,
                        errorMessage,
                        error instanceof Error
                                ? error
                                : new Error(String(error)),
                )
        }
}

/**
 * Retry an operation with exponential backoff
 * Note: Sequential retries are intentional here for exponential backoff
 */
export async function retryWithBackoff<T>(
        fn: () => Promise<T>,
        maxRetries: number = 3,
        initialDelay: number = 100,
): Promise<T> {
        let lastError: Error | undefined
        for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                        // biome-ignore lint/performance/noAwaitInLoops: Sequential retries with delays are intentional for exponential backoff
                        return await fn()
                } catch (error) {
                        lastError =
                                error instanceof Error
                                        ? error
                                        : new Error(String(error))
                        if (attempt < maxRetries - 1) {
                                const delay = initialDelay * 2 ** attempt
                                await new Promise((resolve) =>
                                        setTimeout(resolve, delay),
                                )
                        }
                }
        }
        if (!lastError) {
                throw new Error('Retry failed with no error')
        }
        throw lastError
}

/**
 * Validate input before operation
 */
export function validateInput<T>(
        value: T | null | undefined,
        validator: (value: T) => boolean,
        errorMessage: string,
): T {
        if (value === null || value === undefined) {
                throw new RefactoringError(
                        ErrorCode.EXTRACTION_ERROR,
                        errorMessage,
                )
        }
        if (!validator(value)) {
                throw new RefactoringError(
                        ErrorCode.EXTRACTION_ERROR,
                        errorMessage,
                )
        }
        return value
}
