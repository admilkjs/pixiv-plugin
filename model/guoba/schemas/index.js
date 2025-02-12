import lodash from "lodash";
import { Config } from "#components";
import config from "./config.js";
import other from "./other.js";
import push from "./push.js";
import tips from "./tips.js";

export const schemas = [config, other, push, tips].flat();

export function getConfigData() {
  return {
    config: Config.getDefOrConfig("config"),
    push: Config.getDefOrConfig("push"),
    tips: Config.getDefOrConfig("tips"),
    other: Config.getDefOrConfig("other"),
  };
}

export async function setConfigData(data, { Result }) {
  let config = Config.getCfg();

  for (const key in data) {
    let split = key.split(".");
    let currentConfig = config;

    for (let i = 0; i < split.length - 1; i++) {
      if (currentConfig[split[i]] === undefined) {
        currentConfig[split[i]] = {};
      }
      currentConfig = currentConfig[split[i]];
    }

    let lastKey = split[split.length - 1];
    if (!lodash.isEqual(currentConfig[lastKey], data[key])) {
      Config.modify(split[0], lastKey, data[key]);
    }
  }
  return Result.ok({}, "𝑪𝒊𝒂𝒍𝒍𝒐～(∠・ω< )⌒★");
}
