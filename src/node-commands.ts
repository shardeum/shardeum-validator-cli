import {Pm2ProcessStatus, statusFromPM2} from './pm2';
import pm2 from 'pm2';
import * as yaml from 'js-yaml';
import {Command} from 'commander';
import path from 'path';
import {exec, execFile} from 'child_process';
import merge from 'deepmerge';
import {
  defaultNetworkConfig,
  networkConfigType,
  networkConfigSchema,
} from './config/default-network-config';
import {
  defaultNodeConfig,
  nodeConfigType,
  nodeConfigSchema,
} from './config/default-node-config';
import {rpcConfigType, rpcConfigSchema} from './config/default-rpc-config';
import fs, {readFileSync} from 'fs';
import {ethers} from 'ethers';
import {
  fetchEOADetails,
  getNetworkParams,
  fetchStakeParameters,
  getAccountInfoParams,
  getPerformanceStatus,
  getLatestCliVersion,
  isGuiInstalled,
  getInstalledGuiVersion,
  getLatestGuiVersion,
  fetchNodeProgress,
  getExitInformation,
  getProgressData,
  isValidatorInstalled,
  getInstalledValidatorVersion,
  fetchValidatorVersions,
  getNodeSettings,
  cache,
  File,
  fetchNodeInfo,
  getUserInput,
  getBranchNameForCLI,
  getBranchNameForGUI,
  getBranchNameForValidator,
  getCommitHashForCLI,
  getCommitHashForGUI,
  getCommitHashForValidator,
} from './utils';
import {isValidPrivate} from 'ethereumjs-util';
import logger from './utils/logger';
import {isIP} from 'net';
import Ajv from 'ajv';
import {VALIDATOR_CLEAN_PATH} from './projectFlags';
type VersionStats = {
  runningCliVersion: string;
  runningCliBranch: string;
  runningCliCommitHash?: string | undefined;
  minimumCliVersion: string;
  latestCliVersion: string;
  minShardeumVersion: string;
  activeShardeumVersion: string;
  minimumGuiVersion?: string;
  latestGuiVersion?: string;
  runningGuiVersion?: string | undefined;
  runningGuiBranch?: string | undefined;
  runningGuiBranchCommitHash?: string | undefined;
  runnningValidatorVersion?: string | undefined;
  runningValidatorBranch?: string | undefined;
  runningValidatorBranchCommitHash?: string | undefined;
};

let config = defaultNetworkConfig;
let nodeConfig: nodeConfigType = defaultNodeConfig;

let rpcServer = {
  url: process.env.RPC_SERVER_URL,
};

const validateNetworkConfig = new Ajv().compile(networkConfigSchema);
const validateNodeConfig = new Ajv().compile(nodeConfigSchema);
const validateRpcConfig = new Ajv().compile(rpcConfigSchema);

const networkConfigPath = path.join(__dirname, `../${File.CONFIG}`);
// eslint-disable-next-line security/detect-non-literal-fs-filename
if (fs.existsSync(networkConfigPath)) {
  // eslint-disable-line security/detect-non-literal-fs-filename
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const fileConfig = JSON.parse(fs.readFileSync(networkConfigPath).toString());
  if (validateNetworkConfig(fileConfig)) {
    // check IP formats
    const networkConfig = fileConfig as networkConfigType;
    // `as networkConfigType` above is valid because validateNetworkConfig() passed
    let good = true;
    for (const archiver of networkConfig.server.p2p.existingArchivers) {
      if (!isIP(archiver.ip)) {
        console.warn(
          `warning: config has been ignored due to invalid IP address: ${archiver.ip}`
        );
        console.warn(`${networkConfigPath}`);
        good = false;
      }
    }
    if (good)
      config = merge(config, networkConfig, {
        arrayMerge: (target, source) => source,
      });
  } else {
    console.warn(
      `warning: config has been ignored due to invalid JSON schema:`
    );
    console.warn(`${networkConfigPath}`);
  }
}

const nodeConfigPath = path.join(__dirname, `../${File.NODE_CONFIG}`);
// eslint-disable-next-line security/detect-non-literal-fs-filename
if (fs.existsSync(nodeConfigPath)) {
  // eslint-disable-line security/detect-non-literal-fs-filename
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const fileConfig = JSON.parse(fs.readFileSync(nodeConfigPath).toString());
  if (validateNodeConfig(fileConfig)) {
    nodeConfig = merge(nodeConfig, fileConfig as nodeConfigType, {
      arrayMerge: (target, source) => source,
    });
    // `as nodeConfigType` above is valid because validateNodeConfig() passed
  } else {
    console.warn(
      `warning: config has been ignored due to invalid JSON schema:`
    );
    console.warn(`${nodeConfigPath}`);
  }
} else {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.writeFileSync(
    path.join(__dirname, `../${File.NODE_CONFIG}`),
    JSON.stringify(nodeConfig, undefined, 2),
    {encoding: 'utf8', mode: 0o600}
  );
}

const rpcConfigPath = path.join(__dirname, `../${File.RPC_SERVER}`);
// eslint-disable-next-line security/detect-non-literal-fs-filename
if (fs.existsSync(rpcConfigPath)) {
  // eslint-disable-line security/detect-non-literal-fs-filename
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const fileConfig = JSON.parse(fs.readFileSync(rpcConfigPath).toString());
  if (validateRpcConfig(fileConfig)) {
    rpcServer = merge(rpcServer, fileConfig as rpcConfigType, {
      arrayMerge: (target, source) => source,
    });
    // `as rpcConfigType` above is valid because validateRpcConfig() passed
  } else {
    console.warn(
      `warning: config has been ignored due to invalid JSON schema:`
    );
    console.warn(`${rpcConfigPath}`);
  }
}

if (process.env.APP_SEEDLIST) {
  config = merge(
    config,
    {
      server: {
        p2p: {
          existingArchivers: [
            {
              ip: process.env.APP_SEEDLIST,
              port: 4000,
              publicKey:
                '758b1c119412298802cd28dbfa394cdfeecc4074492d60844cc192d632d84de3',
            },
          ],
        },
      },
    },
    {arrayMerge: (target, source) => source}
  );
}

if (process.env.EXISTING_ARCHIVERS) {
  const existingArchivers = JSON.parse(process.env.EXISTING_ARCHIVERS);
  if (existingArchivers.length > 0) {
    config = merge(
      config,
      {
        server: {
          p2p: {
            existingArchivers,
          },
        },
      },
      {arrayMerge: (target, source) => source}
    );
  }
}

if (process.env.APP_MONITOR) {
  config = merge(
    config,
    {
      server: {
        reporting: {
          recipient: `http://${process.env.APP_MONITOR}:3000/api`,
        },
      },
    },
    {arrayMerge: (target, source) => source}
  );
}

if (process.env.EXT_IP) {
  config = merge(
    config,
    {
      server: {
        ip: {
          externalIp:
            process.env.EXT_IP === 'auto'
              ? process.env.SERVERIP
              : process.env.EXT_IP,
        },
      },
    },
    {arrayMerge: (target, source) => source}
  );
}

if (process.env.INT_IP) {
  config = merge(
    config,
    {
      server: {
        ip: {
          internalIp:
            process.env.INT_IP === 'auto'
              ? process.env.SERVERIP
              : process.env.INT_IP,
        },
      },
    },
    {arrayMerge: (target, source) => source}
  );
}

if (process.env.SHMEXT) {
  config = merge(config, {
    server: {
      ip: {
        externalPort: parseInt(process.env.SHMEXT),
      },
    },
  });
}

if (process.env.SHMINT) {
  config = merge(config, {
    server: {
      ip: {
        internalPort: parseInt(process.env.SHMINT),
      },
    },
  });
}

const dashboardPackageJson = JSON.parse(
  readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
);

// eslint-disable-next-line security/detect-non-literal-fs-filename
fs.writeFileSync(
  path.join(__dirname, `../${File.CONFIG}`),
  JSON.stringify(config, undefined, 2)
);

export function registerNodeCommands(program: Command) {
  program
    .command('status')
    .description(
      'Show if validator is running or not; also the port and URL to connect to it'
    )
    .action(async () => {
      pm2.describe('validator', async (err, descriptions) => {
        // PM2 not reachable
        if (err) {
          console.error(err);
          return pm2.disconnect();
        }

        let publicKey = '';
        // Fetch the public key from secrets.json if it exists
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        if (fs.existsSync(path.join(__dirname, `../${File.SECRETS}`))) {
          const secrets = JSON.parse(
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            fs
              .readFileSync(path.join(__dirname, `../${File.SECRETS}`))
              .toString()
          );
          publicKey = secrets.publicKey;
        }

        const [
          {stakeRequired},
          performance,
          {totalTimeValidating, lastRotationIndex, lastActive},
          {exitMessage, exitStatus},
          accountInfo,
        ] = await Promise.all([
          fetchStakeParameters(config),
          getPerformanceStatus(),
          fetchNodeProgress().then(getProgressData),
          getExitInformation(),
          getAccountInfoParams(config, publicKey),
        ]);
        // TODO: Use Promise.allSettled. Need to update nodeJs to 12.9

        if (descriptions.length === 0) {
          // Node process not started
          console.log(
            yaml.dump({
              state: 'stopped',
              exitMessage,
              exitStatus,
              performance,
              stakeRequirement: stakeRequired
                ? ethers.utils.formatEther(stakeRequired)
                : '',
              lockedStake: accountInfo.lockedStake
                ? ethers.utils.formatEther(accountInfo.lockedStake)
                : '',
              totalPenalty: accountInfo.totalPenalty
                ? ethers.utils.formatEther(accountInfo.totalPenalty)
                : '',
              autorestart: nodeConfig.autoRestart,
            })
          );
          cache.writeMaps();
          return pm2.disconnect();
        }

        const description = descriptions[0];
        const status: Pm2ProcessStatus = statusFromPM2(description);
        if (status.status !== 'stopped') {
          // Node is started and active

          let nodeInfo;
          try {
            nodeInfo = await fetchNodeInfo(config);
          } catch (e) {
            logger.error('Unable to fetch node info: ' + e);
            nodeInfo = null;
          }

          const lockedStakeStr = accountInfo.lockedStake
            ? ethers.utils.formatEther(accountInfo.lockedStake)
            : '';
          let nodeStatus = nodeInfo.status;
          if (nodeStatus === 'initializing')
            nodeStatus =
              lockedStakeStr === '0.0' ? 'need-stake' : 'waiting-for-network';

          console.log(
            yaml.dump({
              state: nodeStatus,
              exitMessage,
              exitStatus,
              totalTimeRunning: status.uptimeInSeconds,
              totalTimeValidating: totalTimeValidating,
              lastActive: lastActive,
              lastRotationIndex: lastRotationIndex,
              stakeRequirement: stakeRequired
                ? ethers.utils.formatEther(stakeRequired)
                : '',
              nominatorAddress: accountInfo.nominator,
              nomineeAddress: publicKey,
              performance,
              currentRewards: ethers.utils.formatEther(
                accountInfo.accumulatedRewards.toString()
              ),
              lockedStake: lockedStakeStr,
              totalPenalty: accountInfo.totalPenalty
                ? ethers.utils.formatEther(accountInfo.totalPenalty)
                : '',
              autorestart: nodeConfig.autoRestart,
              nodeInfo: nodeInfo,
              // TODO: Add fetching node info when in standby
            })
          );
          cache.writeMaps();
          return pm2.disconnect();
        }

        // Node was started but is currently inactive
        console.log(
          yaml.dump({
            state: 'stopped',
            exitMessage,
            exitStatus,
            performance,
            stakeRequirement: stakeRequired
              ? ethers.utils.formatEther(stakeRequired)
              : '',
            lockedStake: accountInfo.lockedStake
              ? ethers.utils.formatEther(accountInfo.lockedStake)
              : '',
            nominatorAddress: accountInfo.nominator,
            currentRewards: accountInfo
              ? ethers.utils.formatEther(
                  accountInfo.accumulatedRewards.toString()
                )
              : '',
            totalPenalty: accountInfo.totalPenalty
              ? ethers.utils.formatEther(accountInfo.totalPenalty)
              : '',
            autorestart: nodeConfig.autoRestart,
          })
        );
        cache.writeMaps();
        return pm2.disconnect();
      });
    });

  program
    .command('stake_info')
    .description('Show staking info for a particular EOA account')
    .argument('<address>', 'The EOA address to fetch stake info for')
    .action(async address => {
      if (!ethers.utils.isAddress(address)) {
        console.error('Invalid address entered');
        return;
      }

      try {
        const eoaData = await fetchEOADetails(config, address)
        const stakeValue = eoaData?.operatorAccountInfo?.stake?.value
        const nominee = eoaData?.operatorAccountInfo?.nominee ?? ''

        // Convert stake value to ether, handling potential hexadecimal input
        const stakeOutput = stakeValue
          ? ethers.utils.formatEther(
              ethers.BigNumber.from(stakeValue.startsWith('0x') ? stakeValue : '0x' + stakeValue).toString()
            )
          : ''

        console.log(yaml.dump({
          stake: stakeOutput,
          nominee: nominee
        }));
      } catch (error) {
        console.log(error)
        console.error(`Error fetching stake details for ${address}: ${error}`)
      }
    });

  program
    .command('start')
    .description('Starts the validator')
    .action(() => {
      // Run the validators clean script

      execFile(
        `node`,
        [`${path.join(__dirname, VALIDATOR_CLEAN_PATH)}`],
        () => {
          // Exec PM2 to start the shardeum validator
          pm2.connect(err => {
            if (err) {
              console.error(err);
              throw 'Unable to connect to PM2';
            }
            const scriptPath = path.join(
              __dirname,
              `../../${File.ENVIRONMENT_CONFIG}`
            );
            pm2.start(scriptPath, err => {
              if (err) throw err;

              pm2.describe('validator', (err, processDescription) => {
                if (err) {
                  pm2.disconnect();
                  throw err;
                }

                if (processDescription && processDescription.length > 0) {
                  const processInfo = processDescription[0];
                  if (processInfo.pm2_env?.status === 'online') {
                    console.log('Node process started');
                  } else {
                    throw new Error(
                      `The process is not running. Status: ${processInfo.pm2_env?.status}`
                    );
                  }
                } else {
                  throw new Error("Node process wasn't started");
                }

                pm2.disconnect();
              });
            });
          });
        }
      );
    });

  program
    .command('stop')
    .description('Stops the validator')
    .option(
      '-f, --force',
      'stops the node without prompting for confirmation even if it is participating and could get slashed'
    )
    .action(options => {
      function stopNode() {
        pm2.stop('validator', err => {
          if (err) {
            console.error(err);
          } else {
            nodeConfig.lastStopped = new Date().getTime();
            console.log('Node process stopped', nodeConfig);
            writeNodeConfig();
          }

          return pm2.disconnect();
        });
      }

      // Exec PM2 to stop the shardeum validator
      pm2.connect(err => {
        if (err) {
          console.error(err);
          throw 'Unable to connect to PM2';
        }

        pm2.describe('validator', async (err, descriptions) => {
          if (descriptions.length === 0) {
            console.error('Node is not running');
            return pm2.disconnect();
          }

          const description = descriptions[0];
          const status: Pm2ProcessStatus = statusFromPM2(description);
          if (status.status === 'stopped') {
            console.error('Node is not running');
            return pm2.disconnect();
          }

          if (!options.force) {
            let nodeInfo;
            try {
              nodeInfo = await fetchNodeInfo(config);
            } catch (error) {
              const answer = await getUserInput(
                'Unable to verify node status. If the node is active, stopping it could result in losing the stake amount. ' +
                  'Confirm if you would like to force the node to stop (y/N): '
              );

              if (answer.toLowerCase() === 'y') {
                return stopNode();
              }
              return pm2.disconnect();
            }

            if (
              nodeInfo != null &&
              (nodeInfo.status === 'syncing' || nodeInfo.status === 'active')
            ) {
              const answer = await getUserInput(
                'The node is active and stopping it could result in losing the stake amount. ' +
                  'Confirm if you would like to force the node to stop (y/N): '
              );
              if (answer.toLowerCase() === 'y') {
                return stopNode();
              }
            }
          }
          return stopNode();
        });
      });
    });

  program
    .command('stake')
    .argument('<value>', 'The amount of SHM to stake')
    .description(
      'Stake the set amount of SHM at the stake address. Rewards will be sent to set reward address.'
    )
    .action(async stakeValue => {
      //TODO should we handle consecutive stakes?

      // Fetch the public key from secrets.json
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      if (!fs.existsSync(path.join(__dirname, `../${File.SECRETS}`))) {
        console.error('Please start the node once before staking');
        return;
      }

      const secrets = JSON.parse(
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        fs.readFileSync(path.join(__dirname, `../${File.SECRETS}`)).toString()
      );

      if (secrets.publicKey == null) {
        console.error('Unable to find public key in secrets.json');
        return;
      }

      // Take input from user for PRIVATE KEY
      let privateKey = await getUserInput('Please enter your private key: ');
      while (
        privateKey.length !== 64 ||
        !isValidPrivate(Buffer.from(privateKey, 'hex'))
      ) {
        console.log('Invalid private key entered.');
        privateKey = await getUserInput('Please enter your private key: ');
      }

      const provider = new ethers.providers.JsonRpcProvider(rpcServer.url);

      const walletWithProvider = new ethers.Wallet(privateKey, provider);

      const [{stakeRequired}, eoaData] = await Promise.all([
        fetchStakeParameters(config),
        fetchEOADetails(config, walletWithProvider.address),
      ]);

      if (
        ethers.BigNumber.from(stakeRequired).gt(
          ethers.utils.parseEther(stakeValue)
        )
      ) {
        if (eoaData == null) {
          /*prettier-ignore*/
          console.error(`Stake amount must be greater than ${ethers.utils.formatEther(stakeRequired)} SHM`);
          return;
        }
      }

      try {
        const [gasPrice, from, nonce] = await Promise.all([
          walletWithProvider.getGasPrice(),
          walletWithProvider.getAddress(),
          walletWithProvider.getTransactionCount(),
        ]);

        const stakeData = {
          isInternalTx: true,
          internalTXType: 6,
          nominator: walletWithProvider.address.toLowerCase(),
          timestamp: Date.now(),
          nominee: secrets.publicKey,
          stake: ethers.utils.parseEther(stakeValue).toString(),
        };
        const value = ethers.BigNumber.from(stakeData.stake);
        console.log(stakeData);

        const txDetails = {
          from,
          to: '0x0000000000000000000000000000000000010000',
          gasPrice,
          gasLimit: 30000000,
          value,
          data: ethers.utils.hexlify(
            ethers.utils.toUtf8Bytes(JSON.stringify(stakeData))
          ),
          nonce,
        };

        const {hash, data, wait} = await walletWithProvider.sendTransaction(
          txDetails
        );

        console.log('TX RECEIPT: ', {hash, data});
        const txConfirmation = await wait();
        console.log('TX CONFRIMED: ', txConfirmation);
      } catch (error) {
        console.error(error);
      }
    });

  async function unstake(options: {force: boolean}) {
    // Take input from user for PRIVATE KEY
    let privateKey = await getUserInput('Please enter your private key: ');
    while (
      privateKey.length !== 64 ||
      !isValidPrivate(Buffer.from(privateKey, 'hex'))
    ) {
      console.log('Invalid private key entered.');
      privateKey = await getUserInput('Please enter your private key: ');
    }

    try {
      const provider = new ethers.providers.JsonRpcProvider(rpcServer.url);

      const walletWithProvider = new ethers.Wallet(privateKey, provider);

      const eoaData = await fetchEOADetails(config, walletWithProvider.address);
      if (!eoaData) {
        console.error("Couldn't unstake (`eoaData` is null)");
        return;
      }

      if (
        eoaData.operatorAccountInfo?.nominee == null ||
        eoaData.operatorAccountInfo?.stake?.value === '00'
      ) {
        console.error('No stake found');
        return;
      }

      const [gasPrice, from, nonce] = await Promise.all([
        walletWithProvider.getGasPrice(),
        walletWithProvider.getAddress(),
        walletWithProvider.getTransactionCount(),
      ]);

      const unstakeData = {
        isInternalTx: true,
        internalTXType: 7,
        nominator: walletWithProvider.address.toLowerCase(),
        timestamp: Date.now(),
        nominee: eoaData?.operatorAccountInfo?.nominee,
        force: options.force ?? false,
      };
      console.log(unstakeData);

      const txDetails = {
        from,
        to: '0x0000000000000000000000000000000000010000',
        gasPrice,
        gasLimit: 30000000,
        data: ethers.utils.hexlify(
          ethers.utils.toUtf8Bytes(JSON.stringify(unstakeData))
        ),
        nonce,
      };
      console.log(txDetails);

      const {hash, data, wait} = await walletWithProvider.sendTransaction(
        txDetails
      );

      console.log('TX RECEIPT: ', {hash, data});
      const txConfirmation = await wait();
      console.log('TX CONFRIMED: ', txConfirmation);
    } catch (error) {
      console.error(error);
    }
  }

  program
    .command('unstake')
    .description('Remove staked SHM')
    .option(
      '-f, --force',
      'Force unstake in case the node is stuck, will forfeit rewards'
    )
    .action(async options => {
      try {
        if (options.force) {
          const answer = await getUserInput(
            'Node is currently participating in the network, unstaking could result in a penalty. ' +
              'Confirm if you would like to force unstake (y/N): '
          );

          if (answer.toLowerCase() !== 'y') {
            return;
          }
        } else {
          let nodeInfo;
          try {
            nodeInfo = await fetchNodeInfo(config);
          } catch (error: unknown) {
            // Error while fetching nodeInfo - presuming node is not active
          }
          const nodeStatus = nodeInfo?.status;
          if (
            nodeStatus === 'initializing' ||
            nodeStatus === 'standby' ||
            nodeStatus === 'syncing' ||
            nodeStatus === 'active'
          ) {
            throw 'Please stop your node before unstaking.';
          }
        }

        await unstake(options);
      } catch (error) {
        console.error(error);
      }
    });

  program
    .command('update')
    .description('Update the CLI and the GUI')
    .action(() => {
      exec(
        'sh update.sh',
        {cwd: path.join(__dirname, '../..')},
        (error, stdout, stderr) => {
          console.log(stdout);
          console.log(stderr);
          if (error != null) {
            console.log(`exec error: ${error}`);
          }
        }
      );

      exec(
        'sh update.sh',
        {cwd: path.join(__dirname, '../../../gui')},
        (error, stdout, stderr) => {
          console.log(stdout);
          console.log(stderr);
          if (error != null) {
            console.log(`exec error: ${error}`);
          }
        }
      );
    });

  program
    .command('version')
    .description(
      'Shows the installed version, latest version and minimum version of the operator dashboard'
    )
    .action(async () => {
      const validatorVersions = await fetchValidatorVersions(config);
      if (!validatorVersions) {
        throw new Error("Couldn't fetch validator versions");
      }

      let versions: VersionStats = {
        runningCliVersion: dashboardPackageJson.version,
        runningCliBranch: await getBranchNameForCLI(),
        runningCliCommitHash: await getCommitHashForCLI(),
        minimumCliVersion: '0.1.0', //TODO query from some official online source
        latestCliVersion: await getLatestCliVersion(),
        minShardeumVersion: validatorVersions.minVersion,
        activeShardeumVersion: validatorVersions.activeVersion,
      };

      if (isGuiInstalled()) {
        versions = {
          ...versions,
          runningGuiVersion: getInstalledGuiVersion(),
          runningGuiBranch: await getBranchNameForGUI(),
          runningGuiBranchCommitHash: await getCommitHashForGUI(),
          minimumGuiVersion: '0.1.0', //TODO query from some official online source
          latestGuiVersion: await getLatestGuiVersion(),
        };
      }

      if (isValidatorInstalled()) {
        versions = {
          ...versions,
          runnningValidatorVersion: getInstalledValidatorVersion(),
          runningValidatorBranch: await getBranchNameForValidator(),
          runningValidatorBranchCommitHash: await getCommitHashForValidator(),
        };
      }
      console.log(yaml.dump(versions));
    });

  program
    .command('network-stats')
    .description(
      'Show statistics like TPS, active nodes etc. about the network'
    )
    .action(async () => {
      pm2.describe('validator', async (err, [descriptions]) => {
        if (!err) {
          const networkStats = await getNetworkParams(config, descriptions);
          console.log(yaml.dump(networkStats));
        }

        pm2.disconnect();
      });
    });

  program
    .command('node-settings')
    .description('Display node settings')
    .action(() => {
      const settings = getNodeSettings();
      console.log(
        yaml.dump({
          autoRestart: settings.autoRestart,
          lastStopped: settings.lastStopped,
        })
      );
    });

  const setCommand = program
    .command('set')
    .description('command to set various config parameters');

  // setCommand
  //   .command('external_port')
  //   .arguments('<port>')
  //   .description('Set the external port for the validator')
  //   .action(port => {
  //     config.server.ip.externalPort = parseInt(port);
  //     // eslint-disable-next-line security/detect-non-literal-fs-filename
  //     fs.writeFile(
  //       path.join(__dirname, `../${File.CONFIG}`),
  //       JSON.stringify(config, undefined, 2),
  //       err => {
  //         if (err) console.error(err);
  //       }
  //     );
  //   });

  // setCommand
  //   .command('internal_port')
  //   .arguments('<port>')
  //   .description('Set the internal port for the validator')
  //   .action(port => {
  //     config.server.ip.internalPort = parseInt(port);
  //     // eslint-disable-next-line security/detect-non-literal-fs-filename
  //     fs.writeFile(
  //       path.join(__dirname, `../${File.CONFIG}`),
  //       JSON.stringify(config, undefined, 2),
  //       err => {
  //         if (err) console.error(err);
  //       }
  //     );
  //   });

  // setCommand
  //   .command('external_ip')
  //   .arguments('<ip>')
  //   .description('Set the external ip for the validator')
  //   .action(ip => {
  //     config.server.ip.externalIp = ip;
  //     // eslint-disable-next-line security/detect-non-literal-fs-filename
  //     fs.writeFile(
  //       path.join(__dirname, `../${File.CONFIG}`),
  //       JSON.stringify(config, undefined, 2),
  //       err => {
  //         if (err) console.error(err);
  //       }
  //     );
  //   });

  // setCommand
  //   .command('internal_ip')
  //   .arguments('<ip>')
  //   .description('Set the internal ip for the validator')
  //   .action(ip => {
  //     config.server.ip.internalIp = ip;
  //     // eslint-disable-next-line security/detect-non-literal-fs-filename
  //     fs.writeFile(
  //       path.join(__dirname, `../${File.CONFIG}`),
  //       JSON.stringify(config, undefined, 2),
  //       err => {
  //         if (err) console.error(err);
  //       }
  //     );
  //   });

  setCommand
    .command('rpc_url')
    .argument('<url>')
    .description("Set the RPC server's URL")
    .action(url => {
      rpcServer.url = url;
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      fs.writeFile(
        path.join(__dirname, `../${File.RPC_SERVER}`),
        JSON.stringify(rpcServer, undefined, 2),
        err => {
          if (err) console.error(err);
        }
      );
    });

  setCommand
    .command('auto_restart')
    .argument('<true/false>')
    .description(
      'To autostart the node after being rotated out. Set autostart to true or false'
    )
    .action((autostart: string) => {
      const input = autostart.toLowerCase();
      if (input !== 'true' && input !== 'false') {
        console.error('Invalid input. Please enter true or false');
        return;
      }
      nodeConfig.autoRestart = input === 'true';
      writeNodeConfig();
    });

  function writeNodeConfig() {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFile(
      path.join(__dirname, `../${File.NODE_CONFIG}`),
      JSON.stringify(nodeConfig, undefined, 2),
      {encoding: 'utf8', mode: 0o600},
      err => {
        if (err) console.error(err);
      }
    );
  }


  // setCommand
  //   .command('archiver')
  //   .arguments('<URL>')
  //   .description('Set the URL for the archiver')
  //   .action(url => {
  //     //TODO interact with node
  //   });
}