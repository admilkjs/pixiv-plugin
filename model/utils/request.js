import axios from "axios";
import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { Config } from "#components";
import { randomInt } from "crypto";
import { Logger } from "#utils";

const config = Config.getDefOrConfig("config");

/**
 * 生成随机的 User-Agent 字符串
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
   * 构造函数
   * @param {string} proxy - 代理地址
   * @param {string} cookie - 请求使用的 Cookie
   */
  constructor(proxy, cookie) {
    this.proxy = proxy;
    this.cookie = cookie;
    this.defaultHeaders = {
      "User-Agent": getRandomUserAgent(),
      "Content-Type": "application/json",
      Referer: "https://www.pixiv.net",
      Origin: "https://www.pixiv.net",
      Cookie: cookie,
    };
    this.agent = this.createAgent(proxy);
    this.maxRetries = 3;
    this.baseRetryDelay = 1000;
  }

  /**
   * 根据代理类型创建代理对象
   * @param {string} proxy - 代理地址
   * @returns {HttpsProxyAgent|SocksProxyAgent|null}
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
   * 执行实际的HTTP请求（内部方法，不触发重试逻辑）
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} 响应数据
   */
  async _doRequest({ method = "GET", url, data = null, headers = {} }) {
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

    const response = await axiosInstance(requestConfig);
    return response.data;
  }

  /**
   * 发起 HTTP 请求（带自动重试）
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} 响应数据
   */
  async request({ method = "GET", url, data = null, headers = {} }) {
    let lastError = null;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          Logger.info(`第${attempt}次重试请求: ${url}`);
        }
        
        return await this._doRequest({ method, url, data, headers });
      } catch (error) {
        lastError = error;
        
        // 记录错误
        Logger.error(`请求失败 (尝试 ${attempt + 1}/${this.maxRetries + 1}):`, error.message);
        if (error.response) {
          Logger.error("响应状态:", error.response.status);
        }
        
        // 如果是最后一次尝试，不再重试
        if (attempt === this.maxRetries) {
          break;
        }
        
        // 判断是否应该重试
        const shouldRetry = error.code === "ECONNABORTED" || 
                           error.code === "ECONNRESET" ||
                           error.code === "ETIMEDOUT" ||
                           (error.response?.status >= 500);
        
        if (!shouldRetry) {
          break;
        }
        
        // 指数退避延迟
        const delay = this.baseRetryDelay * Math.pow(2, attempt);
        Logger.warn(`等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
}

const proxy = config.proxy;
const cookie = config.cookie;
const Request = new HttpClient(proxy, cookie);

export default Request;
