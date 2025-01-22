import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PluginPath = join(__dirname, '..').replace(/\\/g, '/')
const PluginTemp = join(PluginPath, 'temp')
const PluginData = join(PluginPath, 'data')

export default {
  PluginPath,
  PluginTemp,
  PluginData
}
