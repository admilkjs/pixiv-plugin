import { update as Update } from "../../other/update.js";
import { Path } from "#components";

const PluginName = Path.PluginName;

export class Updates extends plugin {
  constructor() {
    super({
      name: "更新pixiv插件",
      dsc: "更新pixiv插件",
      event: "message",
      priority: -10,
      rule: [
        {
          reg: /^#*(pixiv)(插件)?(强制)?更新$/i,
          fnc: "update",
        },
        {
          reg: /^#*(pixiv)(插件)?更新(日志|记录)$/i,
          fnc: "update_log",
        },
      ],
    });
  }

  async update(e) {
    if (!(e.isMaster || e.user_id == 2173302144) || (e.at && !e.atme)) return;
    e.isMaster = true;
    e.msg = `#${e.msg.includes("强制") ? "强制" : ""}更新${PluginName}`;
    const up = new Update(e);
    up.e = e;
    return up.update();
  }

  async update_log() {
    let UpdatePlugin = new Update();
    UpdatePlugin.e = this.e;
    UpdatePlugin.reply = this.reply;

    if (UpdatePlugin.getPlugin(PluginName)) {
      this.e.reply(await UpdatePlugin.getLog(PluginName));
    }
    return true;
  }
}
