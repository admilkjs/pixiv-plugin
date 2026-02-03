/**
 * @fileoverview 插件全局常量定义
 * @module model/constants
 */

/**
 * 插件全局常量
 * @typedef {Object} Constants
 * @property {number} MAX_IMAGE_SIZE - 最大图片大小（字节）
 * @property {number} MAX_RETRY_DELAY - 最大重试延迟（毫秒）
 * @property {number} DEFAULT_RETRY_COUNT - 默认重试次数
 * @property {number} DEFAULT_DELAY - 默认延迟（毫秒）
 * @property {number} MAX_TITLE_LENGTH - 最大标题长度
 * @property {number} MAX_TAGS_COUNT - 最大标签数量
 * @property {number} MAX_RELATED_WORKS - 最大相关作品数量
 * @property {number} MAX_MESSAGE_LENGTH - 最大消息长度
 * @property {number} MAX_LINE_LENGTH - 最大行长度
 * @property {string} USER_AGENT - 默认 User-Agent
 */

/** @type {Constants} */
export const CONSTANTS = {
  // 文件相关
  MAX_IMAGE_SIZE: 20 * 1024 * 1024, // 20MB
  
  // 重试相关
  MAX_RETRY_DELAY: 2000,
  DEFAULT_RETRY_COUNT: 2,
  DEFAULT_DELAY: 0,
  
  // 内容限制
  MAX_TITLE_LENGTH: 50,
  MAX_TAGS_COUNT: 15,
  MAX_RELATED_WORKS: 10,
  MAX_MESSAGE_LENGTH: 3000,
  MAX_LINE_LENGTH: 1000,
  
  // 请求头
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

export default CONSTANTS;
