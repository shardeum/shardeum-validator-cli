const { fork } = require('child_process')
const path = require('path')
const fs = require('fs')

let shouldAutoRestart
const configFilePath = path.join(__dirname, './build/nodeConfig.json')

// Function to update shouldAutoRestart from the config file
const updateAutoRestartStatus = () => {
  try {
    const configFileContent = fs.readFileSync(configFilePath).toString()
    const config = JSON.parse(configFileContent)
    shouldAutoRestart = config.autoRestart
  } catch (error) {
    console.error(`Error reading or parsing the config file: ${error}`)
  }
}

// Initialize shouldAutoRestart
updateAutoRestartStatus()

// Watch the config file for changes
fs.watch(configFilePath, (eventType, filename) => {
  if (eventType === 'change') {
    console.log(`${filename} has been updated. Updating auto-restart status...`)
    updateAutoRestartStatus()
  }
})

const startApp = () => {
  const app = fork(path.join(__dirname, '../validator/dist/src/index.js'), {
    cwd: path.join(__dirname, './build'),
    execArgv: ['--max-old-space-size=6144'],
  })

  app.on('exit', (code) => {
    console.log(`Child process exited with code ${code}. shouldAutoRestart: `, shouldAutoRestart)
    if (shouldAutoRestart && code === 0) {
      console.log('Restarting validator')
      startApp()
    } else {
      // Propagate the child process exit code to the main process
      process.exit(code)
    }
  })
}

startApp()
