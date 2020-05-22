import type { UpdateRootProperties, UserProperties } from './types'

import { API_ENDPOINT } from '../common'
import { FileSystem } from '../fs/filesystem'
import { api, dns } from '../misc'
import ipfs, { CID } from '../ipfs'

import { USERNAME_BLACKLIST } from './blacklist'
import { ucan, didKey } from './identity'


/**
 * Create a user account.
 */
export const createAccount = async (
  userProps: UserProperties,
  apiEndpoint: string = API_ENDPOINT,
  apiDidKey?: string
): Promise<any> => {
  apiDidKey = apiDidKey || await api.didKey()

  const jwt = await ucan({
    audience: apiDidKey,
    issuer: await didKey(),
  })

  return fetch(`${apiEndpoint}/user`, {
    method: 'PUT',
    headers: {
      'authorization': `Bearer ${jwt}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(userProps)
  })
}

/**
 * Get the CID of a user's data root.
 */
export const fileRoot = async (username: string): Promise<CID> => {
  try {
    // TODO: This'll be `files.${username}.fission.name` later
    return await dns.lookupDnsLink(`${username}.fission.name`)
  } catch(err) {
    throw new Error("Could not locate user root in dns")
  }
}

/**
 * Check if a username is available.
 */
export const isUsernameAvailable = async (username: string): Promise<boolean> => {
  try {
    const resp = await fetch(`https://${username}.fission.name`, { method: "HEAD" })
    return resp.status >= 300
  } catch (_) {
    return true
  }
}

/**
 * Check if a username is valid.
 */
export const isUsernameValid = (username: string): boolean => {
  return !username.startsWith("-") &&
         !username.endsWith("-") &&
         !!username.match(/[a-zA-Z1-9-]+/) &&
         !USERNAME_BLACKLIST.includes(username)
}

/**
 * Update a user's data root.
 */
export const updateRoot = async (props: UpdateRootProperties): Promise<any> => {
  const apiDid = props.apiDid || await api.didKey()
  const apiEndpoint = props.apiEndpoint || API_ENDPOINT

  const cid = await props.fileSystem.root.put()
  const jwt = await ucan({
    audience: apiDid,
    issuer: await didKey(),
    proof: props.authUcan
  })

  return fetch(`${apiEndpoint}/user/data/${cid}`, {
    method: 'PATCH',
    headers: {
      'authorization': `Bearer ${jwt}`
    }
  })
}


export default {
  createAccount,
  didKey,
  fileRoot,
  isUsernameAvailable,
  isUsernameValid,
  ucan,
  updateRoot
}
