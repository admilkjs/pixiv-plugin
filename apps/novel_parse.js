import { Pixiv } from "#model";
const { Novel, Novels } = Pixiv
const novelReg =
  /(?:https?:\/\/)?(?:www\.)?pixiv\.net\/novel\/(?:series\/(\d+)|show\.php\?id=(\d+))/i;

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
      const info = await Novel(showId);
      // 将内容按段落分割
      const paragraphs = info.content.split('\n\n');
      const messages = [];
      let currentMessage = '';
      
      // 处理每个段落
      for (const paragraph of paragraphs) {
        // 如果当前段落加上现有内容超过1000字符，就创建新消息
        if (currentMessage.length + paragraph.length + 2 > 1000) {
          if (currentMessage) {
            messages.push(currentMessage);
          }
          currentMessage = paragraph;
        } else {
          if (currentMessage) currentMessage += '\n\n';
          currentMessage += paragraph;
        }
      }
      
      // 添加最后一条消息
      if (currentMessage) {
        messages.push(currentMessage);
      }

      // 构建转发消息数组
      const forwardMsg = [
        { message: `标题: ${info.title}`, nickname: Bot.nickname || "Pixiv-Plugin", user_id: Bot.uin },
        ...messages.map(msg => ({ message: msg, nickname: Bot.nickname || "Pixiv-Plugin", user_id: Bot.uin }))
      ];

      // 尝试多种发送方法
      let success = false;
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
        await e.reply(`${info.title}:\n${info.content}`);
      }
    } else if (seriesId) {
      const info = await Novels(seriesId);
      const seriesName = info[0].seriesTitle;
      const messages = [];
      messages.push(`系列: ${seriesName}`);

      for (const item of info) {
        const { title, content } = await Novel(item.id);
        // 将内容按段落分割
        const paragraphs = content.split('\n\n');
        let currentMessage = '';
        
        // 处理每个段落
        for (const paragraph of paragraphs) {
          // 如果当前段落加上现有内容超过1000字符，就创建新消息
          if (currentMessage.length + paragraph.length + 2 > 1000) {
            if (currentMessage) {
              messages.push(currentMessage);
            }
            currentMessage = paragraph;
          } else {
            if (currentMessage) currentMessage += '\n\n';
            currentMessage += paragraph;
          }
        }
        
        // 添加最后一条消息
        if (currentMessage) {
          messages.push(currentMessage);
        }
      }

      // 构建转发消息数组
      const forwardMsg = messages.map(msg => ({ 
        message: msg, 
        nickname: Bot.nickname || "Pixiv-Plugin", 
        user_id: Bot.uin 
      }));

      // 尝试多种发送方法
      let success = false;
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
        await e.reply(messages.join('\n\n'));
      }
    }
  }
}
