const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const glob = require('glob');

const assetPatterns = glob.sync('games/*/assets').map((assetPath) => ({
    from: path.resolve(__dirname, assetPath),
    to: 'assets',
}));

module.exports = {
    mode: 'development',
    entry: './core/client/index.ts',
    output: {
        path: path.resolve(process.cwd(), 'dist/client'),
        filename: './bundle.[contenthash].min.js',
    },
    devServer: {
        port: 3000,
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                },
            },
            {
                test: [/\.vert$/, /\.frag$/],
                use: 'raw-loader',
            },
            {
                test: /\.(gif|png|jpe?g|svg|xml|glsl)$/i,
                use: 'file-loader',
            },
            {
                test: /\.ts$/,
                loader: 'ts-loader',
                exclude: '/node_modules/',
                options: {
                    compilerOptions: {
                        noEmit: false,
                    },
                },
            },
        ],
    },
    optimization: {
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    output: {
                        comments: false,
                    },
                },
            }),
        ],
    },
    plugins: [
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            template: './index.html',
        }),
        new CopyPlugin({
            patterns: assetPatterns,
        }),
    ],
};
