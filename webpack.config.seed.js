const path = require("path");

const name = "seed";

module.exports = {
  entry: `./scripts/${name}.ts`,
  mode: "production",

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        options: { configFile: "tsconfig.scripts.json" },
        include: [path.resolve(__dirname, `scripts/${name}.ts`)],
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    symlinks: false,
  },
  output: {
    filename: `${name}.js`,
    path: path.resolve(__dirname, "dist"),
  },
};
