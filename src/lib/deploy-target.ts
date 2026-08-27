export type DeployTarget = 'local' | 'cloudflare' | 'node'

export function getDeployTarget(): DeployTarget {
  const value =
    import.meta.env?.DEPLOY_TARGET ??
    (typeof process !== 'undefined' ? process.env.DEPLOY_TARGET : undefined)
  if (value === 'cloudflare' || value === 'node') return value
  return 'local'
}
