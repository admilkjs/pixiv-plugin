import { Pixiv } from "#model";
const { Novel, Novels } = Pixiv;
import { splitText, sendSegmentedMessages } from "../model/utils/TextUtils.js";
import { Logger } from "#utils";
import ErrorHandler from "../model/utils/ErrorHandler.js";

const novelReg =
  /(?:https?:\/\/)?(?:www\.)?pixiv\.net\/novel\/(?:series\/(\d+)|show\.php\?id=(\d+))/i;

// 并发限制数
const CONCURRENCY_LIMIT = 5;

/**
 * 限制并发执行的函数
 * @param {Array} items - 要处理的项目数组
 * @param {Function} fn - 处理函数
 * @param {number} limit - 并发限制数
 * @returns {Promise<Array>}
 */
async function limitConcurrency(items, fn, limit) {
  const results = [];
  const executing = [];
  
  for (const [index, item] of items.entries()) {
    const promise = Promise.resolve().then(() => fn(item, index));
    results.push(promise);
    
    if (limit <= items.length) {
      const e = promise.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  
  return Promise.all(results);
}

export default class extends plugin {
  constructor() {
    super({
      name: "pixiv-plugin",
      dsc: "pixiv-plugin",
      event: "message",
      priority: -2000,
      rule: [
        {
          reg: novelReg,
          fnc: "parse",
        },
      ],
    });
  }

  async parse(e) {
    const match = e.msg.match(novelReg);
    // eslint-disable-next-line no-unused-vars
    const [_, seriesId, showId] = match;

    if (showId) {
      await this.handleSingleNovel(e, showId);
    } else if (seriesId) {
      await this.handleNovelSeries(e, seriesId);
    }
  }

  /**
   * 处理单篇小说
   */
  async handleSingleNovel(e, showId) {
    try {
      const info = await Novel(showId);
      const title = `标题: ${info.title || '未知'}`;
      const author = `作者: ${info.userName || '未知'}`;
      
      const contentSegments = splitText(info.content || '无内容');
      const message = [title, author, ...contentSegments];
      
      await sendSegmentedMessages(e, message, 'Pixiv小说');
    } catch (error) {
      Logger.error("获取小说信息失败", error);
      const friendlyError = ErrorHandler.handleJSError(error, `获取小说(ID: ${showId})信息`);
      await e.reply(friendlyError);
    }
  }

  /**
   * 处理小说系列
   */
  async handleNovelSeries(e, seriesId) {
    try {
      const info = await Novels(seriesId);
      const seriesName = info[0]?.seriesTitle || '未知';
      
      await e.reply(`正在获取系列"${seriesName}"的小说，共${info.length}篇，请稍候...`);
      
      const message = [`系列: ${seriesName}`];
      
      // 使用并发限制获取所有小说信息
      const novelInfos = await limitConcurrency(
        info, 
        async (item) => {
          try {
            return await Novel(item.id);
          } catch (err) {
            Logger.warn(`获取小说 ${item.id} 失败:`, err);
            return { title: item.title, content: '获取失败', userName: '未知' };
          }
        },
        CONCURRENCY_LIMIT
      );
      
      for (const novelInfo of novelInfos) {
        const title = `标题: ${novelInfo.title || '未知'}`;
        const author = `作者: ${novelInfo.userName || '未知'}`;
        
        const contentSegments = splitText(novelInfo.content || '无内容');
        message.push(title, author, ...contentSegments, '-------------------');
      }
      
      await sendSegmentedMessages(e, message, 'Pixiv小说系列');
    } catch (error) {
      Logger.error("获取系列小说信息失败", error);
      const friendlyError = ErrorHandler.handleJSError(error, `获取小说系列(ID: ${seriesId})信息`);
      await e.reply(friendlyError);
    }
  }
}
