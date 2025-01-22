import path from 'path'
const Path = process.cwd()
const PluginName = 'pixiv-plugin'
const PluginPath = path.join(Path, 'plugins', PluginName)
const PluginTemp = path.join(PluginPath, 'temp')
const PluginData = path.join(PluginPath, 'data')
export {
  Path,
  PluginPath,
  PluginTemp,
  PluginData,
  PluginName
}
