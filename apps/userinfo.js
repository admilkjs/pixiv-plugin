import { Pixiv } from "#model";
const { User } = Pixiv;
import { Logger } from "#utils";
const usersReg = /https:\/\/www\.pixiv\.net\/users\/(\d+).*/i;

export default class extends plugin {
  constructor() {
    super({
      name: "pixiv-plugin",
      dsc: "pixiv-plugin",
      event: "message",
      priority: -2000,
      rule: [
        {
          reg: usersReg,
          fnc: "parse",
        },
      ],
    });
  }

  async parse(e) {
    const match = e.msg.match(usersReg);
    if (match) {
      const uid = match[1];
      try {
        const info = await User(uid);
        const infomsg = [
          `昵称: ${info.name}`,
          `头像: `,
          segment.image(info.image),
          `性别: ${info.gender.name}`,
          `年龄: ${info.age.name}`,
          `生日: ${info.birthDay.name}`,
          `地区: ${info.region.name}(${info.region.region})`,
          `总关注用户数: ${info.following}`,
        ];
        const forwardMsg = await e.runtime.common.makeForwardMsg(e, infomsg);
        await e.reply(forwardMsg);
      } catch (error) {
        Logger.error("获取用户信息失败", error);
        await e.reply("获取用户信息时出错，请稍后再试。");
      }
    }
  }
}
