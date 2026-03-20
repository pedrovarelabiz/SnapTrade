const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    entry: {
      background: path.resolve(__dirname, "src/background/service-worker.ts"),
      "ws-interceptor": path.resolve(__dirname, "src/ws-interceptor.ts"),
      floating: path.resolve(__dirname, "src/floating.ts"),
      content: path.resolve(__dirname, "src/content/content-script.ts"),
      popup: path.resolve(__dirname, "src/popup/popup.tsx"),
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          exclude: /content\/overlay\.css$/,
          use: ["style-loader", "css-loader"],
        },
      ],
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx"],
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, "src/floating.html"),
        filename: "floating.html",
        chunks: ["floating"],
        inject: "body",
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, "manifest.json"),
            to: path.resolve(__dirname, "dist/manifest.json"),
          },
          {
            from: path.resolve(__dirname, "assets"),
            to: path.resolve(__dirname, "dist/assets"),
          },
          {
            from: path.resolve(__dirname, "src/selectors"),
            to: path.resolve(__dirname, "dist/selectors"),
            globOptions: {
              pattern: "**/*.json",
            },
            noErrorOnMissing: true,
          },
          {
            from: path.resolve(__dirname, "src/content/overlay.css"),
            to: path.resolve(__dirname, "dist/overlay.css"),
            noErrorOnMissing: true,
          },
        ],
      }),
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, "src/popup/popup.html"),
        filename: "popup.html",
        chunks: ['popup'],
        inject: 'body',
      }),
    ],
    devtool: isProduction ? false : "cheap-module-source-map",
    optimization: {
      splitChunks: false,
    },
  };
};
