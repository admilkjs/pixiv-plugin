import Version from './Version.js'
import YamlReader from './YamlReader.js'
import Config from './Config.js'
import {
  Path,
  PluginPath,
  PluginTemp,
  PluginData,
  PluginName
} from './Path.js'
let BotName = Version.isTrss
  ? 'Trss-Yunzai'
  : Version.isMiao
    ? 'Miao-Yunzai'
    : 'Yunzai-Bot'
export {
  Version,
  Path,
  YamlReader,
  Config,
  PluginName,
  PluginPath,
  PluginTemp,
  PluginData,
  BotName
}
