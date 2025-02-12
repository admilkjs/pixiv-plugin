import axios from "axios";
import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { Config } from "#components";
import { randomInt } from "crypto";
import { Logger } from "#utils";
const config = Config.getDefOrConfig("config");

/**
 * 生成随机的 User-Agent 字符串，增强伪装性
 */
function getRandomUserAgent() {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36",
    "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:53.0) Gecko/20100101 Firefox/53.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.97 Safari/537.36",
  ];
  return userAgents[randomInt(0, userAgents.length)];
}

/**
 * HttpClient 类用于发起带有代理和 Cookie 配置的 HTTP 请求
 */
class HttpClient {
  /**
   * 构造函数，初始化代理、cookie 和默认请求头
   * @param {string} proxy - 代理地址（可以是 http、https 或 socks 类型）
   * @param {string} cookie - 请求使用的 Cookie
   */
  constructor(proxy, cookie) {
    this.proxy = proxy;
    this.cookie = cookie;
    this.defaultHeaders = {
      "User-Agent": getRandomUserAgent(),
      "Content-Type": "application/json",
      Referer: "https://www.pixiv.net", // 防盗链
      Origin: "https://www.pixiv.net",
      Cookie: cookie,
    };
    this.agent = this.createAgent(proxy);
  }

  /**
   * 根据代理类型创建代理对象
   * @param {string} proxy - 代理地址
   * @returns {HttpsProxyAgent|SocksProxyAgent|null} 代理对象，或 null（如果没有代理）
   */
  createAgent(proxy) {
    if (!proxy) return null;
    if (proxy.startsWith("http://") || proxy.startsWith("https://")) {
      return new HttpsProxyAgent(proxy);
    } else if (proxy.startsWith("socks")) {
      return new SocksProxyAgent(proxy);
    } else {
      throw new Error("代理类型既不是http也不是socks");
    }
  }

  /**
   * 发起 HTTP 请求
   * @param {Object} options - 请求选项
   * @param {string} options.method - 请求方法（GET 或 POST）
   * @param {string} options.url - 请求的 URL
   * @param {Object} options.data - 请求的数据（仅适用于 POST 方法）
   * @param {Object} options.headers - 请求头
   * @returns {Promise<Object>} 请求的响应数据
   * @throws {Error} 如果请求失败，抛出错误
   */
  async request({ method = "GET", url, data = null, headers = {} }) {
    try {
      // 随机化 User-Agent 和其他头部
      const combinedHeaders = {
        ...this.defaultHeaders,
        ...headers,
        "User-Agent": getRandomUserAgent(),
      };

      const axiosInstance = axios.create({
        httpsAgent: this.agent ? this.agent : null,
        httpAgent: this.agent ? this.agent : null,
        timeout: 10000,
      });

      const requestConfig = {
        method,
        url,
        headers: combinedHeaders,
      };

      if (method.toUpperCase() === "POST" && data) {
        requestConfig.data = data;
      }

      await new Promise((resolve) => setTimeout(resolve));

      const response = await axiosInstance(requestConfig);
      return response.data;
    } catch (error) {
      // 错误处理和日志记录
      Logger.error("请求失败:", error);
      if (error.response) {
        Logger.error("响应状态:", error.response.status);
        Logger.error("响应数据:", error.response.data);
      }

      // 如果请求失败且是网络问题或服务器问题，尝试重试
      if (error.code === "ECONNABORTED" || error.response?.status >= 500) {
        Logger.warn("请求失败，尝试重新请求...");
        return this.retryRequest({ method, url, data, headers });
      }

      throw error;
    }
  }

  /**
   * 请求失败时重试请求
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} 请求的响应数据
   */
  async retryRequest({ method, url, data, headers }) {
    try {
      // 最大重试次数设置为 3
      const retries = 3;
      for (let i = 0; i < retries; i++) {
        try {
          const response = await this.request({ method, url, data, headers });
          return response;
        } catch (error) {
          if (i === retries - 1) throw error;
          Logger.warn(`重试第 ${i + 1} 次请求...`);
          await new Promise((resolve) => setTimeout(resolve));
        }
      }
    } catch (error) {
      Logger.error("请求重试失败:", error);
      throw error;
    }
  }
}

const proxy = config.proxy;
const cookie = config.cookie;
const Request = new HttpClient(proxy, cookie);

export default Request;
