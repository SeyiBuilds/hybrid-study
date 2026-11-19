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
  /** The on-device model counts as fast enough if the speed check finishes within this time. */
  deviceFastMaxMs: 8000,
}

export type RouterConfig = typeof ROUTER_DEFAULTS
