import puppeteer from "puppeteer";

class Novels {
  constructor({ cookie, proxy }) {
    this.cookie = cookie;
    this.proxy = proxy || null;
  }
  /**
   * 初始化浏览器实例
   */
  async initBrowser() {
    const browserOptions = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--no-zygote",
        "--disable-translate",
      ],
      ignoreHTTPSErrors: true,
    };

    if (this.proxy) {
      browserOptions.args.push(`--proxy-server=${this.proxy}`);
    }

    return await puppeteer.launch(browserOptions);
  }
  /**
   * 获取系列中的所有小说内容
   * @param {string} seriesId Pixiv系列ID
   * @param {puppeteer.Browser} [browser] 可选的浏览器实例，如果传入将不会重新初始化
   * @returns {Promise<Object[]>} 包含所有章节内容的数组
   */
  async fetchSeriesContent(seriesId, browser = null) {
    if (!/^\d+$/.test(seriesId)) {
      console.warn("Invalid series ID. Returning empty array.");
      return [];
    }

    let page;

    // 如果传入浏览器实例，则直接使用它来创建新页面
    if (browser) {
      page = await browser.newPage();
    } else {
      const newBrowser = await this.initBrowser();
      page = await newBrowser.newPage(); // 启动新页面
    }

    try {
      await page.setCookie(...this._parseCookies(this.cookie));

      const chapterUrls = await this.getChapterUrls(page, seriesId);
      console.log(`Found ${chapterUrls.length} chapters.`);

      const chapters = [];

      for (const [index, url] of chapterUrls.entries()) {
        console.log(`Fetching chapter ${index + 1}...`);
        const novel = new Novel({
          cookie: this.raw_cookie,
          proxy: this.proxy,
          page,
        });
        const chapter = await novel.fetchNovelContent(url.match(/\d+/)[0]);
        chapters.push(chapter);
        console.log(chapters)
      }

      return chapters;
    } catch (err) {
      console.error(`Error fetching series content: ${err.message}`);
      return [];
    } finally {
      if (!browser) {
        await page.browser().close(); // 只有在没有传入浏览器的情况下才关闭
      }
    }
  }
  /**
   * 解析cookie字符串为puppeteer可用的cookie格式
   * @param {string} cookieString cookie字符串
   */
  _parseCookies(cookieString) {
    return cookieString.split(";").map((cookie) => {
      const [name, ...value] = cookie.trim().split("=");
      return { name, value: value.join("="), domain: ".pixiv.net" };
    });
  }
  /**
   * 获取Pixiv系列中的所有章节链接
   * @param {puppeteer.Page} page Puppeteer页面实例
   * @param {string} seriesId Pixiv系列ID
   * @returns {Promise<string[]>} 包含所有章节URL的数组
   */
  async getChapterUrls(page, seriesId) {
    const seriesUrl = `https://www.pixiv.net/novel/series/${seriesId}`;
    let chapterUrls = [];
    let pageNum = 1;

    while (true) {
      console.log(`Fetching chapter URLs from page ${pageNum}...`);
      const url = `${seriesUrl}?p=${pageNum}`;
      await page.goto(url, { waitUntil: "domcontentloaded" });

      try {
        await page.waitForSelector(".sc-1c4k3wn-12 a", { timeout: 10000 });
      } catch (err) {
        console.warn(`No more chapters found on page ${pageNum}.`);
        break;
      }

      const urls = await page.$$eval(".sc-1c4k3wn-12 a", (links) =>
        links.map((link) => link.href)
      );

      if (urls.length === 0) break;
      chapterUrls = chapterUrls.concat(urls);
      pageNum++;
    }

    return chapterUrls;
  }
}

class Novel {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   * @param {string} options.cookie Pixiv的cookie字符串
   * @param {string} [options.proxy] 可选的代理字符串
   * @param {puppeteer.Page} [options.page] 可选的已初始化Page实例
   */
  constructor({ cookie, proxy, page }) {
    this.cookie = cookie;
    this.proxy = proxy;
    this.page = page || null;
  }

  /**
   * 初始化浏览器实例
   */
  async initBrowser() {
    if (this.page) return; // 如果已经传入页面实例，则不再初始化浏览器

    const browserOptions = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--no-zygote",
        "--disable-translate",
      ],
      ignoreHTTPSErrors: true,
    };

    if (this.proxy) {
      browserOptions.args.push(`--proxy-server=${this.proxy}`);
    }

    const browser = await puppeteer.launch(browserOptions);
    this.page = await browser.newPage();
    await this.page.setCookie(...this._parseCookies(this.cookie));
  }

  /**
   * 解析cookie字符串为puppeteer可用的cookie格式
   * @param {string} cookieString cookie字符串
   */
  _parseCookies(cookieString) {
    return cookieString.split(";").map((cookie) => {
      const [name, ...value] = cookie.trim().split("=");
      return { name, value: value.join("="), domain: ".pixiv.net" };
    });
  }

  /**
   * 获取Pixiv小说内容
   * @param {string} novelId Pixiv小说ID
   * @returns {Promise<Object>} 小说的标题与内容
   */
  async fetchNovelContent(novelId) {
    if (!/^[0-9]+$/.test(novelId)) {
      throw new Error("Invalid novel ID");
    }

    const url = `https://www.pixiv.net/novel/show.php?id=${novelId}`;
    await this.initBrowser();

    try {
      await this.page.goto(url, { waitUntil: "domcontentloaded" });

      const titleSelector = ".sc-1u8nu73-3";
      const contentSelector = ".sc-khIgEk p";

      await this.page.waitForSelector(titleSelector, { timeout: 15000 });
      await this.page.waitForSelector(contentSelector, { timeout: 15000 });

      const title = await this._safeEvaluate(titleSelector, (el) =>
        el.textContent.trim()
      );
      const paragraphs = await this._safeEvaluateAll(contentSelector, (nodes) =>
        nodes.map((node) => node.textContent.trim()).join("\n")
      );

      return { title, paragraphs };
    } catch (err) {
      throw new Error(`Failed to fetch novel content: ${err.message}`);
    }
  }

  async _safeEvaluate(selector, callback) {
    try {
      return await this.page.$eval(selector, callback);
    } catch {
      console.warn(`Selector not found: ${selector}`);
      return "N/A";
    }
  }

  async _safeEvaluateAll(selector, callback) {
    try {
      return await this.page.$$eval(selector, callback);
    } catch {
      console.warn(`Selector not found: ${selector}`);
      return "";
    }
  }
}

export { Novels, Novel };