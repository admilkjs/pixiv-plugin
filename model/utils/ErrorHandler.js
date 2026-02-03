/**
 * @fileoverview 错误处理工具类
 * @module model/utils/ErrorHandler
 */

/**
 * 错误处理工具类
 * 提供统一的错误处理和友好错误信息生成
 */
class ErrorHandler {
  /**
   * 根据HTTP状态码获取错误建议
   * @param {number} status - HTTP状态码
   * @param {string} context - 错误上下文描述
   * @returns {string} 友好的错误建议文本
   * @example
   * const advice = ErrorHandler.getErrorAdvice(404, "作品信息");
   * // 返回包含404错误原因和建议的文本
   */
  static getErrorAdvice(status, context) {
    const errorMap = {
      404: `访问资源不存在(404错误)，可能原因：
1. 请检查您的Pixiv Cookie是否已正确配置和更新
2. 该作品可能已被删除或设为私有
3. 网络连接可能存在问题，请检查您是否能正常访问Pixiv网站
4. ${context}可能需要特定权限`,
      403: `访问被拒绝(403错误)，可能原因：
1. 您的Pixiv Cookie可能已过期，请更新
2. 该作品可能有年龄限制，需要登录账号查看
3. ${context}可能需要特定权限`,
      401: `未授权访问(401错误)，请检查您的Pixiv Cookie是否有效，可能需要重新登录Pixiv`,
      500: `Pixiv服务器错误(${status})，请稍后再试`,
      0: `网络连接问题，请检查：
1. 您的网络是否能正常访问Pixiv
2. 是否需要使用代理访问
3. 您的Pixiv Cookie是否已正确配置`
    };

    return errorMap[status] || `请求错误(${status})，请检查网络连接和Pixiv Cookie配置`;
  }

  /**
   * 处理JavaScript错误并返回友好的错误信息
   * @param {Error} error - 错误对象
   * @param {string} context - 错误上下文描述
   * @returns {string} 友好的错误信息
   * @example
   * try {
   *   // some code
   * } catch (error) {
   *   const message = ErrorHandler.handleJSError(error, "获取用户信息");
   *   await e.reply(message);
   * }
   */
  static handleJSError(error, context) {
    const errorMsg = error.message || "未知错误";
    
    if (errorMsg.includes("Cannot read properties of undefined") || 
        errorMsg.includes("Cannot read property") ||
        errorMsg.includes("is undefined")) {
      return `${context}出错: ${errorMsg}\n\n此错误通常是由于接口返回的数据异常导致的，最常见的原因是Cookie无效或过期。`;
    }
    
    if (errorMsg.includes("fetch") || 
        errorMsg.includes("network") || 
        errorMsg.includes("请求") ||
        errorMsg.includes("axios")) {
      return `${context}出错: 网络请求失败\n\n可能原因：
1. 网络连接不稳定
2. Pixiv服务器暂时无法访问
3. 您的Cookie配置可能已过期或无效
4. 可能需要使用代理才能正常访问Pixiv`;
    }
    
    return `${context}出错: ${errorMsg}，请稍后再试。`;
  }

  /**
   * 判断是否为网络相关错误
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否为网络错误
   */
  static isNetworkError(error) {
    const errorMsg = error.message || "";
    return errorMsg.includes("fetch") || 
           errorMsg.includes("network") || 
           errorMsg.includes("ECONNREFUSED") ||
           errorMsg.includes("ETIMEDOUT") ||
           errorMsg.includes("ENOTFOUND");
  }

  /**
   * 从错误消息中提取HTTP状态码
   * @param {string} errorMessage - 错误消息
   * @returns {number|null} HTTP状态码或null
   */
  static extractStatusCode(errorMessage) {
    const match = errorMessage.match(/(\d{3})/);
    return match ? parseInt(match[1]) : null;
  }
}

export { ErrorHandler };
export default ErrorHandler;
