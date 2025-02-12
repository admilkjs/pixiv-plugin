import { ArtWorks, ArtWorksInfo } from "#model";

const artworksReg = /https:\/\/www\.pixiv\.net\/artworks\/(\d+).*/;

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
          `标签: ${info.tags.map((i) => `${i.tag}(${i.en})`).join(", ")}`,
        ];
        images.unshift(...infomsg);
        const forwardMsg = await e.runtime.common.makeForwardMsg(e, images);
        await e.reply(forwardMsg);
      } catch (error) {
        await e.reply("获取作品信息时出错，请稍后再试。");
      }
    }
  }
}
