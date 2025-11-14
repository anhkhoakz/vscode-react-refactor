//@ts-check

import { resolve as _resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import TerserPlugin from 'terser-webpack-plugin'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**@type {import('webpack').Configuration}*/
const config = {
        target: 'node',

        entry: './src/extension.ts',
        output: {
                path: _resolve(__dirname, 'dist'),
                filename: 'extension.js',
                libraryTarget: 'commonjs2',
                devtoolModuleFilenameTemplate: '../[resource-path]',
        },
        devtool: 'source-map',
        externals: {
                vscode: 'commonjs vscode',
        },
        resolve: {
                extensions: ['.ts', '.js'],
        },
        module: {
                rules: [
                        {
                                test: /\.ts$/,
                                exclude: /node_modules/,
                                use: [
                                        {
                                                loader: 'ts-loader',
                                        },
                                ],
                        },
                ],
        },
        optimization: {
                minimize: true,
                minimizer: [
                        new TerserPlugin({
                                terserOptions: {
                                        compress: {
                                                drop_console: true,
                                                drop_debugger: true,
                                                pure_funcs: [
                                                        'console.log',
                                                        'console.info',
                                                        'console.debug',
                                                ],
                                                passes: 2,
                                                unsafe_arrows: true,
                                                unsafe_methods: true,
                                                unsafe_proto: true,
                                        },
                                        format: {
                                                ecma: 2020,
                                        },
                                },
                        }),
                ],
        },
}
export default config
