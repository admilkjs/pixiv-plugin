import axios from "axios";
import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
/**
 * @description 请求类
 * @param {String} proxy 代理地址
 */
class Request {
  constructor(proxy = null) {
    const axiosConfig = {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36",
      },
    };

    if (proxy) {
      if (proxy.startsWith("socks")) {
        axiosConfig.httpAgent = new SocksProxyAgent(proxy);
        axiosConfig.httpsAgent = new SocksProxyAgent(proxy);
      } else {
        axiosConfig.httpAgent = new HttpsProxyAgent(proxy);
        axiosConfig.httpsAgent = new HttpsProxyAgent(proxy);
      }
    }

    this.axios = axios.create(axiosConfig);
  }
  /**
   * @description 请求方法
   * @param {String} method 请求方法: get, post
   * @param {String} url 请求地址
   * @param {Object} data 请求数据: get请求为params, post请求为data
   * @param {String} responseType 返回数据类型: json, text, blob, arraybuffer, document, stream
   * @returns {Promise} 返回请求结果
   */
  async request(method, url, data = null, responseType = "json") {
    const config = {
      method,
      url,
      responseType,
    };
    if (method === "get") {
      config.params = data;
    } else {
      config.data = data;
    }
    return this.axios(config);
  }

  async get(url, params) {
    return this.request("get", url, params);
  }

  async post(url, data) {
    return this.request("post", url, data);
  }
}
import Config from "../../components/Config.js";
export default Request
