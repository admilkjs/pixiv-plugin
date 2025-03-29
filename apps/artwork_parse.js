import { Pixiv } from "#model";
const { ArtWorks, ArtWorksInfo, Related } = Pixiv;
import { Config } from "#components";
import { Logger } from "#utils";
const artworksReg = /https:\/\/www\.pixiv\.net\/artworks\/(\d+).*/i;

export default class extends plugin {
  constructor() {
    super({
      name: "pixiv-plugin",
      dsc: "pixiv-plugin",
      event: "message",
      priority: -2000,
      rule: [
        {
          reg: artworksReg,
          fnc: "parse",
        },
      ],
    });
  }

  async parse(e) {
    let config = Config.getConfig("parse");
    if (!config.artworks_parse) return false;
    const match = e.msg.match(artworksReg);
    if (match) {
      const pid = match[1];
      try {
        const artworks = await ArtWorks(pid);
        const images = artworks.map((i) => segment.image(i.original));
        const info = await ArtWorksInfo(pid);
        const infomsg = [
          `标题: ${info.title}`,
          `作者pid: ${info.authorid}`,
          `创建日期: ${info.createDate}`,
          `标签: ${info.tags.map((i) => `${i.tag}${i.en ? `(${i.en})` : ""}`).join(", ")}`,
        ];
        images.unshift(...infomsg);
        if (config.search_related) {
          images.push("相关作品:");
          let related = await Related(pid);
          if (related) {
            images.push(
              ...related.illusts.map((info) => [
                `标题: ${info.title}\n`,
                `作者: ${info.userName}(${info.userId})\n`,
                `创建日期: ${info.createDate}\n`,
                `标签: ${info.tags.join(", ")}\n`,
                `页数: ${info.pageCount}\n`,
                `链接: https://www.pixiv.net/artworks/${info.id}\n`,
              ]),
            );
          }
        }
        const forwardMsg = await e.runtime.common.makeForwardMsg(e, images);
        await e.reply(forwardMsg);
        return false;
      } catch (error) {
        Logger.error(error);
        await e.reply("获取作品信息时出错，请稍后再试。");
      }
    }
  }
}
