const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const ZipPlugin = require("zip-webpack-plugin");
const pluginManifest = require("./plugin.json");

const packageImagePatterns = [
  ["icon", "icon.png"],
  ["preview", "preview.png"],
].flatMap(([field, legacyName]) => {
  const fileName =
    pluginManifest[field] || (fs.existsSync(legacyName) ? legacyName : "");
  return fileName ? [{ from: fileName, to: "./dist/" }] : [];
});

module.exports = (env, argv) => {
  const production = argv.mode === "production";
  const plugins = [
    new MiniCssExtractPlugin({
      filename: production ? "dist/index.css" : "index.css",
    }),
  ];

  if (production) {
    if (fs.existsSync("LICENSE")) {
      plugins.push(
        new webpack.BannerPlugin({
          banner: () => fs.readFileSync("LICENSE").toString(),
        })
      );
    }
    plugins.push(
      new CopyPlugin({
        patterns: [
          ...packageImagePatterns,
          { from: "README*.md", to: "./dist/" },
          { from: "plugin.json", to: "./dist/" },
          { from: "src/i18n/", to: "./dist/i18n/" },
          { from: "src/i18n/", to: "./i18n/" },
        ],
      })
    );
    plugins.push({
      apply: (compiler) => {
        compiler.hooks.afterEmit.tap("CopyDistToRootPlugin", () => {
          try {
            if (fs.existsSync(path.resolve(__dirname, "dist/index.js"))) {
              fs.copyFileSync(
                path.resolve(__dirname, "dist/index.js"),
                path.resolve(__dirname, "index.js")
              );
            }
            if (fs.existsSync(path.resolve(__dirname, "dist/index.css"))) {
              fs.copyFileSync(
                path.resolve(__dirname, "dist/index.css"),
                path.resolve(__dirname, "index.css")
              );
            }
          } catch (err) {
            console.warn("CopyDistToRoot warning:", err);
          }
        });
      },
    });
    plugins.push(
      new ZipPlugin({
        filename: "package.zip",
        algorithm: "gzip",
        include: [/dist/],
        pathMapper: (assetPath) => assetPath.replace("dist/", ""),
      })
    );
  } else {
    plugins.push(
      new CopyPlugin({
        patterns: [{ from: "src/i18n/", to: "./i18n/" }],
      })
    );
  }

  return {
    mode: argv.mode || "development",
    watch: Boolean(env && env.watch),
    devtool: production ? false : "eval-source-map",
    performance: {
      hints: false,
    },
    output: {
      filename: "[name].js",
      path: path.resolve(__dirname),
      libraryTarget: "commonjs2",
      library: {
        type: "commonjs2",
      },
    },
    externals: {
      siyuan: "siyuan",
    },
    entry: {
      [production ? "dist/index" : "index"]: "./src/index.ts",
    },
    optimization: {
      minimize: production,
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js", ".css", ".json"],
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          include: [path.resolve(__dirname, "src")],
          use: [
            {
              loader: "esbuild-loader",
              options: {
                loader: "tsx",
                target: "es2020",
              },
            },
          ],
        },
        {
          test: /\.css$/,
          include: [path.resolve(__dirname, "src")],
          use: [
            MiniCssExtractPlugin.loader,
            {
              loader: "css-loader",
            },
            {
              loader: "postcss-loader",
            },
          ],
        },
      ],
    },
    plugins,
  };
};
