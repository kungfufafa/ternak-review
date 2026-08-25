export type DeployTarget = 'local' | 'cloudflare' | 'node'

export function getDeployTarget(): DeployTarget {
  const value = import.meta.env.DEPLOY_TARGET
  if (value === 'cloudflare' || value === 'node') return value
  return 'local'
}

export function isCloudflareDeploy() {
  return getDeployTarget() === 'cloudflare'
}
