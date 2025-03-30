import lodash from 'lodash'
import { Config } from '#components'
import config from './config.js'
import parse from './parse.js'
import jm from './jm.js'

export const schemas = [...config, ...jm, ...parse]
export function getConfigData() {
    return {
        config: Config.getDefOrConfig('config'),
        jm: Config.getDefOrConfig('jm'),
        parse: Config.getDefOrConfig('parse'),
    }
}

export async function setConfigData(data, { Result }) {
    let config = Config.getCfg()

    for (const key in data) {
        let split = key.split('.')
        let currentConfig = config

        for (let i = 0; i < split.length - 1; i++) {
            if (currentConfig[split[i]] === undefined) {
                currentConfig[split[i]] = {}
            }
            currentConfig = currentConfig[split[i]]
        }

        let lastKey = split[split.length - 1]
        if (!lodash.isEqual(currentConfig[lastKey], data[key])) {
            Config.modify(split[0], lastKey, data[key])
        }
    }
    return Result.ok({}, '𝑪𝒊𝒂𝒍𝒍𝒐～(∠・ω< )⌒★')
}
