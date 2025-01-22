import puppeteer from "puppeteer";

class PixivNovelDownloader {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.cookie - Pixiv的cookie字符串
   * @param {string} [options.proxy] - 可选的代理字符串，例如 'http://localhost:8080' 或 'socks5://localhost:1080'
   */
  constructor({ cookie, proxy }) {
    this.cookie = cookie;
    this.proxy = proxy;
  }

  /**
   * 初始化浏览器实例
   */
  async _setupBrowser() {
    const browserOptions = {
      headless: true, // 保持无头模式
      args: [
        "--no-sandbox", // 禁用沙箱（对于某些环境如CI/CD很重要）
        "--disable-setuid-sandbox", // 禁用setuid沙箱
        "--disable-dev-shm-usage", // 防止因共享内存不足导致的错误
        "--disable-gpu", // 禁用GPU硬件加速，头模式下不需要GPU加速
        "--disable-software-rasterizer", // 禁用软件渲染（如果不需要，提升性能）
        "--no-zygote", // 禁用zygote进程，节省内存
        "--disable-translate", // 禁用自动翻译功能
        "--headless", // 保持无头模式
      ],
      ignoreHTTPSErrors: true, // 忽略HTTPS错误
    };

    if (this.proxy) {
      browserOptions.args = [`--proxy-server=${this.proxy}`];
    }

    this.browser = await puppeteer.launch(browserOptions);
    this.page = await this.browser.newPage();
    await this.page.setCookie(...this._parseCookies(this.cookie));
  }

  /**
   * 解析cookie字符串为puppeteer可用的cookie格式
   * @param {string} cookieString - cookie字符串
   */
  _parseCookies(cookieString) {
    return cookieString.split(";").map((cookie) => {
      const [name, ...value] = cookie.trim().split("=");
      return { name, value: value.join("="), domain: ".pixiv.net" };
    });
  }

  /**
   * 获取Pixiv小说内容
   * @param {string} novelId - Pixiv小说ID
   * @returns {Promise<string>} 小说内容
   */
  async fetchNovelContent(novelId) {
    if (!/^[0-9]+$/.test(novelId)) {
      throw new Error("Invalid novel ID");
    }

    const url = `https://www.pixiv.net/novel/show.php?id=${novelId}`;
    await this._setupBrowser();
    try {
      await this.page.goto(url, { waitUntil: "domcontentloaded" });

      // 等待标题元素加载
      const titleSelector = ".sc-1u8nu73-3";
      const contentSelector = ".sc-khIgEk p";

      await this.page.waitForSelector(titleSelector, { timeout: 15000 });
      await this.page.waitForSelector(contentSelector, { timeout: 15000 });

      // 尝试获取小说标题和内容
      const title = await this._safeEvaluate(titleSelector, (el) =>
        el.textContent.trim()
      );
      const paragraphs = await this._safeEvaluateAll(contentSelector, (nodes) =>
        nodes.map((node) => node.textContent.trim()).join("\n")
      );

      return { title, paragraphs };
    } catch (err) {
      throw new Error(`Failed to fetch novel content: ${err.message}`);
    } finally {
      await this.browser.close();
    }
  }

  /**
   * 安全执行单个元素的选择器操作
   * @param {string} selector - CSS选择器
   * @param {Function} callback - 操作回调
   * @returns {Promise<*>} 回调结果
   */
  async _safeEvaluate(selector, callback) {
    try {
      return await this.page.$eval(selector, callback);
    } catch {
      console.warn(`Selector not found: ${selector}`);
      return "N/A";
    }
  }

  /**
   * 安全执行多个元素的选择器操作
   * @param {string} selector - CSS选择器
   * @param {Function} callback - 操作回调
   * @returns {Promise<*>} 回调结果
   */
  async _safeEvaluateAll(selector, callback) {
    try {
      return await this.page.$$eval(selector, callback);
    } catch {
      console.warn(`Selector not found: ${selector}`);
      return "";
    }
  }
}

export default PixivNovelDownloader;