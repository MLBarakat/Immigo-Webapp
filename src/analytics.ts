// A simple mock analytics service. In a real app, this would wrap
// a real analytics library like Segment, Mixpanel, or PostHog.

class AnalyticsService {
    track(eventName: string, properties?: Record<string, any>) {
    console.log(`[ANALYTICS] Event: ${eventName}`, properties || '');
    // In a real implementation:
    // window.analytics.track(eventName, properties);
  }
}

export const analytics = new AnalyticsService();
