export function useAnalytics() {
  const noop = () => {};
  return {
    trackEvent: noop,
    trackFormEvent: noop,
    trackFeatureUsage: noop,
    trackStateChange: noop,
    trackComponentInteraction: noop,
    trackUtilityUsage: noop,
  };
}

