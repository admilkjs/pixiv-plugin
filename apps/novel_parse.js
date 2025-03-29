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
      const msg = await e.runtime.common.makeForwardMsg(e, [
        `标题: ${info.title}`,
        `内容: ${info.content}`,
      ]);
      e.reply(msg);
    } else if (seriesId) {
      const info = await Novels(seriesId);
      const seriesName = info[0].seriesTitle;
      const msg = await Promise.all(
        info.map(async (item) => {
          const { title, content } = await Novel(item.id);
          return [`标题: ${title}`, `内容: ${content}`];
        }),
      );
      msg.unshift(`系列: ${seriesName}`);
      e.reply(await e.runtime.common.makeForwardMsg(e, msg.flat()));
    }
  }
}
