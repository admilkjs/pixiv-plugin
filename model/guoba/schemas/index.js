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
    for (const fullKey in data) {
        const parts = fullKey.split('.');
        const name = parts[0];
        const key = parts.slice(1).join('.');
        Config.modify(name, key, data[fullKey], "config");
    }
    return Result.ok({}, 'Ciallo～(∠・ω< )⌒☆');
}