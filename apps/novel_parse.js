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
      try {
        const info = await Novel(showId);
        const msg = [
          {
            type: 'node',
            data: {
              name: 'Pixiv小说',
              uin: e.bot.uin,
              content: [
                `标题: ${info.title}`,
                `作者: ${info.userName}`,
                `内容: ${info.content}`
              ].join('\n')
            }
          }
        ];
        await e.reply(msg);
      } catch (error) {
        await e.reply('获取小说信息失败，请重试');
      }
    } else if (seriesId) {
      try {
        const info = await Novels(seriesId);
        const seriesName = info[0].seriesTitle;
        
        const msg = [
          {
            type: 'node',
            data: {
              name: 'Pixiv小说系列',
              uin: e.bot.uin,
              content: `系列: ${seriesName}`
            }
          }
        ];

        for (const item of info) {
          const novelInfo = await Novel(item.id);
          msg.push({
            type: 'node',
            data: {
              name: 'Pixiv小说',
              uin: e.bot.uin,
              content: [
                `标题: ${novelInfo.title}`,
                `作者: ${novelInfo.userName}`,
                `内容: ${novelInfo.content}`
              ].join('\n')
            }
          });
        }

        await e.reply(msg);
      } catch (error) {
        await e.reply('获取系列小说信息失败，请重试');
      }
    }
  }
}
