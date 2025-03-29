import fs from "node:fs/promises";
import path from "path";
import chalk from "chalk";
import { pathToFileURL } from "url";
import Path from "./components/Path.js";
import { Logger } from "#utils";
const appsDir = path.join(Path.PluginPath, "apps");
const colors = ["red", "green", "yellow", "blue", "magenta", "cyan", "white"];
const coloredDashes = Array.from({ length: 23 }, () => {
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  return chalk[randomColor]("*");
}).join("");
import Express from "./model/express/init.js";
const startTime = Date.now();
const apps = {};

let successCount = 0;
let failureCount = 0;

Logger.info(chalk.cyan("pixiv插件载入中..."));

async function scanDirectory(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const tasks = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      tasks.push(...(await scanDirectory(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      tasks.push({
        name: path.basename(entry.name, ".js"),
        filePath: pathToFileURL(fullPath).href,
      });
    }
  }

  return tasks;
}

try {
  const filePaths = await scanDirectory(appsDir);
  Logger.debug(`构建模块路径完成，共计 ${filePaths.length} 个模块。`);

  Logger.debug("开始并发加载所有模块...");

  const loadModules = filePaths.map(async ({ name, filePath }) => {
    const loadStartTime = Date.now();

    try {
      const moduleExports = await import(filePath);
      const defaultExport =
        moduleExports?.default || moduleExports[Object.keys(moduleExports)[0]];

      if (!defaultExport) {
        Logger.debug(`模块 ${name} 没有有效的导出内容`);
        return;
      }

      let newName = name;

      apps[newName] = defaultExport;

      const loadTime = Date.now() - loadStartTime;
      Logger.debug(
        chalk.green(`成功载入模块：${newName}，耗时 ${loadTime} ms`),
      );
      successCount++;
    } catch (error) {
      Logger.error(chalk.red(`加载模块失败：${name}`));
      Logger.error(error);
      failureCount++;
    }
  });

  await Promise.all(loadModules);
} catch (error) {
  Logger.error(`扫描或加载文件时出错：${chalk.red(error)}`);
  Logger.debug(error);
}

const endTime = Date.now();
const elapsedTime = endTime - startTime;

Logger.info(coloredDashes);
Logger.info(chalk.green("pixiv插件载入完成"));
Logger.info(`成功加载：${chalk.green(successCount)} 个`);
Logger.info(`加载失败：${chalk.red(failureCount)} 个`);
Logger.info(`总耗时：${chalk.yellow(elapsedTime)} 毫秒`);
Logger.info(coloredDashes);

export { apps };
