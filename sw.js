// Tune Up beta — service worker: shows push notifications and opens the right screen when one is tapped. No caching (the app is small and always online).
const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAMAAABlApw1AAAAYFBMVEWcOwj29PAAAADClg6nUibQp4+kSxzo2MzJl3zizL66eVby6+XZuKXu49rCiWqvYzrLnIGlTiDdwbCzakOeQA6+gF++gWDXs54AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADLeXcLAAAAIHRSTlP//wD///////////////////////////8AAAAAAAAAAAAaHfEAAAKjSURBVHja7d3rctowFATgtWTLxhcMpJf3f9OWFszNlpRpjLTu7s+MIPthRQSY4cBEBIkS1S3T7tEK5N0+bED+9f0EMNT3EcBRf5kAlvpLBBD1nxWAqP4sAVz9XwUg6/8iAFv/ZwHo+j8JwNf/UQDC/g8CMPa/F4Cy/50AnP1vgs0AAFIBWPtfBRsBALSCbQAAXsEmAACxYAsAgFkgQHoAqCOAAAIoiqIoiqIoiqIoiqJQxBWXVAIIIIAAAggggAACCCBAdPZFIO1tbX350W757prrzUoBBBBAgP8D8JnnAQEEEEAAAQQQQAABBBBAAAEEEEAAAdYCHNgBFQWg3jDglDVgd1k0hI15AvrrqvD95AkIb/A2BLB/kgrQzLzlvnCN5gF2ypcLrr+39y2aHt9DcAfNAexDvhjQhY94oCwCx9DBB7B2TUEdPmDumMU4D+w8AGtXFUyb9xi1qvcesykA08Xf+1b9mPp9+A6pOYC16wqmv8/6m++wmvZIffT3fzvgVu3kYp4JXgTlrvABrF1bcDvBu5/fR+cC59DvZfebzR3+PgBdnwwwRnxO/LRPhqotHVz50Uz/wrVNMsDdJfABXO37UPyAhAA3xAAezvrnVEgJQFnHADAuChqkBcBVMYAl6NB6X9S/of+5WzWEAfPQyiEDwNmwr0710PkAwPEJOlRl8G2VN/WPP3ab/uzshrpvxpgb5Ab4fNj7r/yC5t0EsIa8vqIoiqIoiqIoiqIoiqIEom/+FkAAdoBmcAjwrwBNAkoO0DSs5ABNhEsO0FTE5AD6wZqazZoeQD/el3/AMv+Ia/4h4/xj3jkExgcwbP1fAIas/yvAcPWfAeRMmCtriAQmFpAnYaGpMRyExZ7GMBA8LY3Jn+DtaPzJu30EIKkiptsvnE0j1vY4mT4AAAAASUVORK5CYII=';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'Tune Up', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Tune Up', { body: d.body || '', icon: ICON, badge: ICON, tag: d.tag || 'tuneup', renotify: true, data: { kind: d.kind || '', pair: d.pair || '' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  const url = new URL('./?n=' + encodeURIComponent(data.kind || 'session') + (data.pair ? '&pair=' + encodeURIComponent(data.pair) : ''), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => 'focus' in w);
    if (c) { c.postMessage({ open: data.kind || 'session', pair: data.pair || '' }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
