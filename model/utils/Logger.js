/**
 * 日志工具类
 * 封装全局 logger 或使用 console 作为后备
 */
class Logger {
  constructor() {
    const methods = ["info", "warn", "error", "mark", "debug"];
    for (const method of methods) {
      this[method] = (...args) => {
        if (global.logger && typeof global.logger[method] === 'function') {
          global.logger[method]("[pixiv-plugin]", ...args);
        } else {
          console.log(`[pixiv-plugin][${method.toUpperCase()}]`, ...args);
        }
      };
    }
  }
}

export default new Logger();
