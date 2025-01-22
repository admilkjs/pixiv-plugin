import fs from 'fs'
import { PluginPath } from './Path.js'
import path from 'path'

const readJsonFile = (filePath) => {
  try {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null
  } catch {
    return null
  }
}

const packageJson = readJsonFile('package.json')
const pluginPackageJson = readJsonFile(path.join(PluginPath, 'package.json'))

const Version = {
  isMiao: Boolean(packageJson?.dependencies?.sequelize),
  isTrss: Array.isArray(Bot.uin),
  get latestVersion () {
    return pluginPackageJson?.version || null
  },
  get yunzai () {
    return packageJson?.version || null
  }
}

export default Version
