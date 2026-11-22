/** Router thresholds. These are the local defaults that Remote Config will be able to override. */
export const ROUTER_DEFAULTS = {
  /** At or above this speed, and within `solidRttMs`, the connection counts as solid. */
  solidDownlinkMbps: 1,
  solidRttMs: 500,
  /** Below this speed, or above `usableRttMs`, the cloud is not worth trying. */
  usableDownlinkMbps: 0.1,
  usableRttMs: 2000,
  /** Questions at least this long count as hard. */
  hardQuestionWords: 25,
  /** How much of the document a cross-page question may send to the cloud. */
  crossPageChars: 20000,
  /**
   * The on-device model counts as fast enough if the speed check finishes within this time.
   * A CPU-only laptop (i7-10610U, no graphics card) measured 7.3 s; 12 s leaves headroom
   * so a check taken at a busy moment doesn't push everyday work to the cloud.
   */
  deviceFastMaxMs: 12000,
  /** A cloud request that hasn't started answering by now is treated as a dead connection. */
  cloudTimeoutMs: 45000,
  /** While the cloud is unreachable, check this often whether the internet is back. */
  reachabilityProbeMs: 15000,
}

export type RouterConfig = typeof ROUTER_DEFAULTS
