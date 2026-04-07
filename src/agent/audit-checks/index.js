'use strict';

const checkModules = {
  publicPages: require('./publicPages'),
  redirects: require('./redirects'),
  securityHeaders: require('./securityHeaders'),
  cookieSecurity: require('./cookieSecurity'),
  cors: require('./cors'),
  authBypass: require('./authBypass'),
  sensitivePaths: require('./sensitivePaths'),
  apiEndpoints: require('./apiEndpoints'),
  rateLimiting: require('./rateLimiting'),
  ssl: require('./ssl'),
  seo: require('./seo'),
  performance: require('./performance'),
  authenticated: require('./authenticated'),
  authorization: require('./authorization'),
};

module.exports = { checkModules };
