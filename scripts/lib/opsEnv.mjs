// Operator-local settings for the scripts in this folder.
//
// Hosts, SSH accounts and key-file locations are not stored in the repository. Each operator sets
// them in the environment. The values are kept in the operator's private maintenance guide.
import { readFileSync } from 'node:fs'

export function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`set ${name} in the environment (see the private maintenance guide)`)
  return value
}

// Path to the owner key file. The file is read in-process and its contents are never printed.
export function ownerKeyFile() {
  return requiredEnv('OWNER_KEY_FILE')
}

export function readOwnerKeyFile() {
  return JSON.parse(readFileSync(ownerKeyFile(), 'utf8'))
}

// SSH target for the CoNET observer node, used to read its beacon REST API on the node itself.
export function conetObserverSshTarget() {
  return `${requiredEnv('CONET_SSH_USER')}@${requiredEnv('CONET_NODE_B')}`
}
