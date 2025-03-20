import * as readline from 'readline'

export function getUserInput(promptMessage: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(promptMessage, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}
