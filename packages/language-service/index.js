'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/language-service.cjs.prod.js')
} else {
  module.exports = require('./dist/language-service.cjs.js')
}
