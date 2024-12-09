import pm2 from 'pm2';
import {Command} from 'commander';
import path = require('path');
import {timingSafeEqual} from 'crypto';
import {Pm2ProcessStatus, statusFromPM2} from './pm2';
import merge from 'deepmerge';
import {
  defaultGuiConfig,
  guiConfigType,
  guiConfigSchema,
} from './config/default-gui-config';
import fs from 'fs';
import * as yaml from 'js-yaml';
import * as cryptoShardus from '@shardus/crypto-utils';
import {getInstalledGuiVersion} from './utils/project-data';
import {File} from './utils';
import crypto from 'crypto';
import Ajv from 'ajv';
import argon2id from 'argon2';

let config = defaultGuiConfig;

const validateGuiConfig = new Ajv().compile(guiConfigSchema);

cryptoShardus.init(
  '64f152869ca2d473e4ba64ab53f49ccdb2edae22da192c126850970e788af347'
);

function isNumber(n: string) {
  const parsedN = parseInt(n);
  return !isNaN(parsedN) && isFinite(parsedN);
}

function validPassword(password: string) {
  return (
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[!@#$%^&*()_+*$]/.test(password)
  );
}

const guiConfigPath = path.join(__dirname, `../${File.GUI_CONFIG}`);
if (fs.existsSync(guiConfigPath)) {
  // eslint-disable-line security/detect-non-literal-fs-filename
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const fileConfig = JSON.parse(fs.readFileSync(guiConfigPath).toString());
  if (validateGuiConfig(fileConfig)) {
    config = merge(config, fileConfig as guiConfigType, {
      arrayMerge: (target, source) => source,
    });
    // `as guiConfigType` above is valid because validateGuiConfig() passed
  } else {
    console.warn(
      `warning: config has been ignored due to invalid JSON schema:`
    );
    console.warn(`${guiConfigPath}`);
  }
}

export function registerGuiCommands(program: Command) {
  const gui = program.command('gui').description('GUI related commands');

  gui
    .command('status')
    .description(
      'Show if GUI is running or not; also the port and URL to connect to it'
    )
    .action(() => {
      pm2.describe('operator-gui', (err, descriptions) => {
        if (err) {
          console.error(err);
          return pm2.disconnect();
        }
        if (descriptions.length === 0) {
          console.log('operator gui not running!');
          return pm2.disconnect();
        }
        const description = descriptions[0];
        const status: Pm2ProcessStatus = statusFromPM2(description);
        status.link = `https://localhost:${config.gui.port}/`;
        console.log(yaml.dump(status));
        return pm2.disconnect();
      });
    });

  gui
    .command('start')
    .description('Starts the GUI server')
    .action(async () => await startGui());

  gui
    .command('restart')
    .description('Restarts the GUI server')
    .action(async () => {
      await stopGui();
      await startGui();
    });

  gui
    .command('version')
    .description('Show the GUI version')
    .action(() => {
      console.log(getInstalledGuiVersion());
    });

  gui
    .command('stop')
    .description('Stops the GUI server')
    .action(async () => {
      await stopGui();
    });

  const setCommand = gui
    .command('set')
    .description('command to set various config parameters');

  setCommand
    .command('port')
    .arguments('<port>')
    .description('Set the GUI server port')
    .action(port => {
      if (!isNumber(port)) {
        console.error('Port is not a number');
        return;
      }
      port = parseInt(port);
      if (port < 1024) {
        console.error('Port is reserved');
        return;
      }
      config.gui.port = parseInt(port);
      process.env.DASHPORT = port; // set the DASHPORT environment variable

      // eslint-disable-next-line security/detect-non-literal-fs-filename
      fs.writeFile(
        path.join(__dirname, `../${File.GUI_CONFIG}`),
        JSON.stringify(config, undefined, 2),
        err => {
          if (err) console.log(err);
        }
      );
    });

  setCommand
    .command('password')
    .arguments('<password>')
    .description(
      'Set the GUI server password, requirements: min 8 characters, max 128 characters, at least 1 lower case letter, at least 1 upper case letter, at least 1 number, at least 1 special character !@#$%^&*()_+*$'
    )
    .option('-h', 'Changes how the password is hashed. For internal use only')
    .action(async (password, options) => {
      if (!options.h) {
        if (!validPassword(password)) {
          console.error(
            'Invalid password: requirements: min 8 characters, at least 1 lower case letter, at least 1 upper case letter, at least 1 number, at least 1 special character !@#$%^&*()_+*$'
          );
          return;
        }

        password = crypto.createHash('sha256').update(password).digest('hex');
      }
      config.gui.pass = await argon2id.hash(password);
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      fs.writeFile(
        path.join(__dirname, `../${File.GUI_CONFIG}`),
        JSON.stringify(config, undefined, 2),
        err => {
          if (err) console.error(err);
        }
      );
    });

  gui
    .command('login')
    .arguments('<password>')
    .description('verify GUI password')
    .action(async password => {
      try {
        // Verify the password with saved hash
        const isValid = await argon2id.verify(config.gui.pass, password);
        if (!isValid) {
          console.log(yaml.dump({login: 'unauthorized'}));
          return;
        }
        console.log(yaml.dump({login: 'authorized'}));
      } catch (err) {
        console.error('Error during password verification:', err);
        console.log(yaml.dump({login: 'unauthorized'})); // Fail-safe unauthorized output
      }
    });

  function startGui() {
    // Exec PM2 to start the GUI server
    return new Promise<void>((resolve, reject) =>
      pm2.connect(err => {
        if (err) {
          console.error(err);
          reject('Unable to connect to PM2');
        }
        // Start next.js front end on port 3000
        pm2.start(
          {
            name: 'operator-gui',
            cwd: `${path.join(__dirname, '../../../gui')}`,
            script: 'npm',
            args: 'start',
            env: {PORT: `${config.gui.port}`},
          },
          err => {
            if (err) {
              console.error(err);
              reject('Unable to start GUI');
            }
            pm2.disconnect();
            resolve();
          }
        );
      })
    );
  }

  function stopGui() {
    return new Promise<void>((resolve, reject) => {
      pm2.connect(err => {
        if (err) {
          console.error(err);
          reject('Unable to connect to PM2');
        }

        pm2.stop('operator-gui', err => {
          if (err) {
            console.log(err);
            reject('Unable to stop gui');
          }
          pm2.disconnect();
          resolve();
        });

        pm2.delete('operator-gui', err => {
          if (err) {
            console.log(err);
            reject('Unable to delete gui');
          }
          pm2.disconnect();
          resolve();
        });
      });
    });
  }
}
