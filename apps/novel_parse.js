import { Pixiv } from "#model";
import common from '../../../lib/common/common.js';
const { Novel, Novels } = Pixiv
const novelReg =
  /(?:https?:\/\/)?(?:www\.)?pixiv\.net\/novel\/(?:series\/(\d+)|show\.php\?id=(\d+))/i;

// 文本分段函数
function splitText(text, maxLength = 1000) {
  if (!text || text.length <= maxLength) return [text];
  
  const segments = [];
  let currentSegment = '';
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (currentSegment.length + line.length + 1 > maxLength) {
      if (currentSegment) {
        segments.push(currentSegment.trim());
        currentSegment = '';
      }
      // 如果单行就超过最大长度，则按字符分割
      if (line.length > maxLength) {
        for (let i = 0; i < line.length; i += maxLength) {
          segments.push(line.slice(i, i + maxLength));
        }
      } else {
        currentSegment = line;
      }
    } else {
      if (currentSegment) currentSegment += '\n';
      currentSegment += line;
    }
  }
  
  if (currentSegment) {
    segments.push(currentSegment.trim());
  }
  
  return segments;
}

// 消息分段发送函数
async function sendSegmentedMessages(e, messages, title, maxSegments = 5) {
  const totalMessages = messages.length;
  const numForwards = Math.ceil(totalMessages / maxSegments);
  
  for (let i = 0; i < numForwards; i++) {
    const start = i * maxSegments;
    const end = Math.min(start + maxSegments, totalMessages);
    const currentMessages = messages.slice(start, end);
    
    const msgx = await common.makeForwardMsg(e, currentMessages, `${title} (${i + 1}/${numForwards})`);
    await e.reply(msgx);
    
    // 如果不是最后一条消息，等待一下再发送下一条
    if (i < numForwards - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
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
      try {
        const info = await Novel(showId);
        const title = `标题: ${info.title || '未知'}`;
        const author = `作者: ${info.userName || '未知'}`;
        
        // 分段处理内容
        const contentSegments = splitText(info.content || '无内容');
        const message = [title, author];
        
        // 添加分段后的内容
        for (const segment of contentSegments) {
          message.push(segment);
        }
        
        await sendSegmentedMessages(e, message, 'Pixiv小说');
      } catch (error) {
        await e.reply('获取小说信息失败，请重试');
      }
    } else if (seriesId) {
      try {
        const info = await Novels(seriesId);
        const seriesName = info[0].seriesTitle;
        
        const message = [`系列: ${seriesName || '未知'}`];
        for (const item of info) {
          const novelInfo = await Novel(item.id);
          const title = `标题: ${novelInfo.title || '未知'}`;
          const author = `作者: ${novelInfo.userName || '未知'}`;
          
          // 分段处理内容
          const contentSegments = splitText(novelInfo.content || '无内容');
          message.push(title);
          message.push(author);
          
          // 添加分段后的内容
          for (const segment of contentSegments) {
            message.push(segment);
          }
          
          // 添加分隔符
          message.push('-------------------');
        }
        
        await sendSegmentedMessages(e, message, 'Pixiv小说系列');
      } catch (error) {
        await e.reply('获取系列小说信息失败，请重试');
      }
    }
  }
}
