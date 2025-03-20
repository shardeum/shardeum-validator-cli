const path = require('path')

module.exports = [
  {
    name: 'validator',
    script: path.join(__dirname, 'auto-restart-controller.js'),
    output: path.join(__dirname, './validator-logs.txt'),
    cwd: path.join(__dirname, './build'),
    autorestart: false, // set this to false because we have our own restart controller
  },
]
