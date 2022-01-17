require('dotenv').config()
const contractAbi = require('./contract_abi.json')
import { utils } from 'near-api-js'
import axios from 'axios'
import NearProvider from './near'
import chalk from 'chalk'
import slack from './slack'

const slackToken = process.env.SLACK_TOKEN || null
const slackChannel = process.env.SLACK_CHANNEL || 'general'
const slackProvider = new slack({ slackToken })
export const notifySlack = text => {
  try {
    if (slackToken) return slackProvider.send({
      slackChannel,
      text
    })
  } catch (e) {
    if (LOG_LEVEL === 'debug') console.log('notifySlack', e);
  }
}

export const pingHeartbeat = async () => {
  if (process.env.HEARTBEAT === 'true') {
    try {
      await axios.get(process.env.HEARTBEAT_URL)
    } catch (e) {
      if (LOG_LEVEL === 'debug') console.log('pingHeartbeat', e);
    }
  }
  return Promise.resolve()
}

function removeUnneededArgs(obj) {
  const allowed = ['agent_account_id', 'payable_account_id', 'account', 'offset', 'accountId', 'account_id', 'payableAccountId']
  const fin = {}

  Object.keys(obj).forEach(k => {
    if (allowed.includes(k)) fin[k] = obj[k]
  })

  return fin
}

export const parseResponse = data => {
  return JSON.parse(Buffer.from(data).toString())
}

// "btoa" should be read as "binary to ASCII"
// btoa converts binary to Base64-encoded ASCII string
export const btoa = (text) => {
  return Buffer.from(text, 'utf8').toString('base64')
}

// "atob" should be read as "ASCII to binary"
// atob converts Base64-encoded ASCII string to binary
export const atob = (base64) => {
  return Buffer.from(base64, 'base64').toString('utf8')
}

export const Near = new NearProvider({
  networkId: env === 'production' ? 'mainnet' : 'testnet',
  accountId: AGENT_ACCOUNT_ID,
})

export const queryRpc = async (account_id, method_name, args, options = {}, args_base64) => {
  // load contract based on abis & type
  let res

  try {
    // TODO: Test this, setup using connection pool
    res = await Near.connection.provider.query({
      request_type: 'call_function',
      finality: 'final',
      account_id,
      method_name,
      ...options,
      args_base64: args_base64 || btoa(JSON.stringify(args || {}))
    })
  } catch (e) {
    if (LOG_LEVEL === 'debug') console.log('queryRpc', e)
  }

  return options && typeof options.request_type !== 'undefined' ? res : parseResponse(res.result)
}


let cronManager = null

export async function connect(options) {
  try {
    await Near.getNearConnection(options)
  } catch (e) {
    log(`${chalk.red('NEAR Connection Failed')}`)
    if (LOG_LEVEL === 'debug') console.log('near connect', e);
    // TODO: Retry with diff Provider before hard exit
    process.exit(1)
  }
}

export async function getCronManager(accountId, options) {
  if (cronManager) return cronManager
  await connect(options)
  const _n = Near
  const abi = contractAbi.abis.manager
  const contractId = contractAbi[env].manager
  if (accountId) _n.accountId = accountId
  cronManager = await _n.getContractInstance(contractId, abi)
  return cronManager
}

export async function getCroncatInfo(options) {
  const manager = await getCronManager(null, options)
  try {
    const res = await manager.get_info()

    return {
      paused: res[0],
      owner_id: res[1],
      agent_active_queue: res[2],
      agent_pending_queue: res[3],
      agent_task_ratio: res[4],
      agents_eject_threshold: res[5],
      slots: res[6],
      tasks: res[7],
      available_balance: res[8],
      staked_balance: res[9],
      agent_fee: res[10],
      gas_price: res[11],
      proxy_callback_gas: res[12],
      slot_granularity: res[13],
      agent_storage_usage: res[14],
    }
  } catch (e) {
    if (LOG_LEVEL === 'debug') console.log('getCroncatInfo', e);
  }
}