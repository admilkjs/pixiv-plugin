class Logger {
  constructor() {
    for (let i of ["info", "warn", "error", "mark", "debug"])
      this[i] = (...args) => logger[i]("[pixiv-plugin]", ...args);
  }
}
export default new Logger();
