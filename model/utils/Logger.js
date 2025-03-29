class Logger {
  constructor() {
    for (let i of ["info", "warn", "error", "mark", "debug"])
      this[i] = (...args) => global.logger? logger[i]("[pixiv-plugin]", ...args):console.log("[pixiv-plugin]", ...args);
  }
}
export default new Logger();
