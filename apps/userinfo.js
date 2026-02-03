import { Pixiv } from "#model";
const { User } = Pixiv;
import { Logger } from "#utils";
import ErrorHandler from "../model/utils/ErrorHandler.js";

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
    if (!match) return false;
    
    const uid = match[1];
    
    try {
      const info = await User(uid);
      
      const infomsg = [
        `昵称: ${info.name}`,
        `头像: `,
        segment.image(info.image),
        `性别: ${info.gender?.name || '未知'}`,
        `年龄: ${info.age?.name || '未知'}`,
        `生日: ${info.birthDay?.name || '未知'}`,
        `地区: ${info.region?.name || '未知'}${info.region?.region ? `(${info.region.region})` : ''}`,
        `总关注用户数: ${info.following || 0}`,
      ];
      
      const forwardMsg = await e.runtime.common.makeForwardMsg(e, infomsg);
      await e.reply(forwardMsg);
    } catch (error) {
      Logger.error("获取用户信息失败", error);
      
      // 统一的错误处理
      const errorMessage = error.message || "未知错误";
      const statusMatch = errorMessage.match(/(\d{3})/);
      
      if (statusMatch) {
        const status = parseInt(statusMatch[1]);
        const advice = ErrorHandler.getErrorAdvice(status, "用户信息");
        await e.reply(`获取用户(ID: ${uid})信息时出错: ${errorMessage}\n\n${advice}`);
      } else {
        const friendlyError = ErrorHandler.handleJSError(error, `获取用户(ID: ${uid})信息`);
        await e.reply(friendlyError);
      }
    }
  }
}
