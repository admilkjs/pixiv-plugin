import fs from "fs";
import { Config } from "#components";
import { Logger } from "#utils";
import { CONSTANTS } from "../constants.js";
import FileUtils from "./FileUtils.js";

/**
 * 消息发送器类
 */
class MessageSender {
  constructor() {
    this.config = Config.getConfig("parse");
  }

  /**
   * 发送消息
   * @param {Object} e - 事件对象
   * @param {string} text - 消息文本
   * @param {Object} options - 发送选项
   */
  async sendMessage(e, text, options = {}) {
    if (!text) return;
    
    const maxLength = options.maxLength || this.config.message?.max_length || CONSTANTS.MAX_MESSAGE_LENGTH;
    const maxLineLength = options.maxLineLength || this.config.message?.max_line_length || CONSTANTS.MAX_LINE_LENGTH;
    const delay = options.delay || this.config.message?.delay || 300;
    
    // 处理过长的行
    const lines = text.split('\n');
    const processedLines = [];
    
    for (const line of lines) {
      if (line.length <= maxLineLength) {
        processedLines.push(line);
      } else {
        // 将过长的行分割成多行
        let remainingText = line;
        while (remainingText.length > 0) {
          const chunk = remainingText.substring(0, maxLineLength);
          processedLines.push(chunk);
          remainingText = remainingText.substring(maxLineLength);
        }
      }
    }
    
    // 将处理后的行重新组合成文本
    const processedText = processedLines.join('\n');
    
    // 如果文本长度超过最大长度，分段发送
    if (processedText.length <= maxLength) {
      await e.reply(processedText);
    } else {
      // 分段发送
      let start = 0;
      while (start < processedText.length) {
        const end = Math.min(start + maxLength, processedText.length);
        const chunk = processedText.substring(start, end);
        await e.reply(chunk);
        start = end;
        
        // 添加延迟，避免消息发送过快
        if (start < processedText.length) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }

  /**
   * 发送PDF文件
   * @param {Object} e - 事件对象
   * @param {string} filePath - 文件路径
   * @param {string} fileName - 文件名
   * @returns {Promise<boolean>}
   */
  async sendPDFFile(e, filePath, fileName) {
    if (!await FileUtils.fileExists(filePath)) {
      Logger.error(`发送PDF文件失败: 文件不存在 ${filePath}`);
      await e.reply(`发送PDF文件失败: 文件不存在`);
      return false;
    }
    
    const fullFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    
    try {
      // 方法1: 群文件上传
      if (e.group?.fs?.upload) {
        try {
          const result = await e.group.fs.upload(filePath, fullFileName);
          if (result) {
            await e.reply(`文件已上传到群文件，请查看: ${fullFileName}`);
            return true;
          }
        } catch (err) {
          Logger.error(`群文件上传失败: ${err.message}`);
        }
      }
      
      // 方法2: 直接发送文件
      if (segment?.file) {
        try {
          await e.reply(segment.file(filePath));
          return true;
        } catch (err) {
          Logger.error(`直接发送文件失败: ${err.message}`);
        }
      }
      
      // 方法3: 作为buffer发送
      const stats = await fs.promises.stat(filePath);
      if (stats.size > CONSTANTS.MAX_IMAGE_SIZE) {
        await e.reply(`PDF文件太大(${FileUtils.formatFileSize(stats.size)})，请考虑减少图片数量或降低图片质量。`);
        return false;
      }
      
      const fileBuffer = await fs.promises.readFile(filePath);
      await e.reply(['PDF文件已就绪', { type: 'file', file: fileBuffer, name: fullFileName }]);
      return true;
      
    } catch (err) {
      Logger.error(`发送PDF文件时出错: ${err.message}`);
      await e.reply(`发送PDF文件失败: ${err.message}`);
      return false;
    }
  }

  /**
   * 发送聊天记录
   * @param {Object} e - 事件对象
   * @param {string} title - 标题
   * @param {string} content - 内容
   * @param {boolean} useMultipleMessages - 是否使用多条消息
   */
  async sendChatRecord(e, title, content, useMultipleMessages = false) {
    const maxLength = this.config.message?.max_length || CONSTANTS.MAX_MESSAGE_LENGTH;
    const delay = this.config.message?.delay || 300;
    
    if (useMultipleMessages && content.length > maxLength) {
      const paragraphs = content.split('\n\n');
      const messages = [];
      let currentMessage = '';
      
      for (const paragraph of paragraphs) {
        if (currentMessage.length + paragraph.length + 2 > maxLength) {
          messages.push(currentMessage);
          currentMessage = paragraph;
        } else {
          if (currentMessage) currentMessage += '\n\n';
          currentMessage += paragraph;
        }
      }
      
      if (currentMessage) messages.push(currentMessage);
      
      for (let i = 0; i < messages.length; i++) {
        const messageTitle = messages.length > 1 ? `${title} (${i+1}/${messages.length})` : title;
        await this.sendSingleChatRecord(e, messageTitle, messages[i]);
        if (i < messages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      return;
    }
    
    await this.sendSingleChatRecord(e, title, content);
  }

  /**
   * 发送单条聊天记录
   * @param {Object} e - 事件对象
   * @param {string} title - 标题
   * @param {string} content - 内容
   */
  async sendSingleChatRecord(e, title, content) {
    const maxLineLength = this.config.message?.max_line_length || CONSTANTS.MAX_LINE_LENGTH;
    
    const messages = [];
    if (content.length > maxLineLength) {
      const lines = content.split('\n');
      let currentMsg = '';
      
      for (const line of lines) {
        if (currentMsg.length + line.length + 1 > maxLineLength) {
          if (currentMsg) messages.push(currentMsg);
          currentMsg = line;
        } else {
          if (currentMsg) currentMsg += '\n';
          currentMsg += line;
        }
      }
      
      if (currentMsg) messages.push(currentMsg);
    } else {
      messages.push(content);
    }
    
    const forwardMsg = [
      { message: title, nickname: Bot.nickname || "Pixiv-Plugin", user_id: Bot.uin },
      ...messages.map(msg => ({ message: msg, nickname: Bot.nickname || "Pixiv-Plugin", user_id: Bot.uin }))
    ];
    
    let success = false;
    
    // 尝试多种发送方法
    const sendMethods = [
      async () => {
        if (typeof Bot.makeForwardMsg === 'function') {
          const opts = e.isGroup ? {} : { target: e.user_id };
          await e.reply(await Bot.makeForwardMsg(forwardMsg, opts));
          return true;
        }
        return false;
      },
      async () => {
        if (e.friend?.makeForwardMsg) {
          await e.reply(await e.friend.makeForwardMsg(forwardMsg));
          return true;
        }
        return false;
      },
      async () => {
        if (e.group?.makeForwardMsg) {
          await e.reply(await e.group.makeForwardMsg(forwardMsg));
          return true;
        }
        return false;
      },
      async () => {
        if (segment?.forward) {
          await e.reply(segment.forward(forwardMsg));
          return true;
        }
        return false;
      },
      async () => {
        if (global.common?.makeForwardMsg) {
          await e.reply(await global.common.makeForwardMsg(e, forwardMsg));
          return true;
        }
        return false;
      }
    ];
    
    for (const method of sendMethods) {
      try {
        success = await method();
        if (success) break;
      } catch (err) {
        Logger.error(`发送消息失败: ${err.message}`);
      }
    }
    
    if (!success) {
      Logger.warn('所有转发消息方法都失败，回退到普通文本发送');
      await e.reply(`${title}:\n${content}`);
    }
  }
}

export { MessageSender };
export default MessageSender;
