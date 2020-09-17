import process from 'process';
import program from 'commander';
import {StartAction} from './actions/start';

program
  .command('start')
  .description('Starts the watcher.')
  .option('-c, --config [path]', 'Path to config file.', './config/main.yaml')
  .action(new StartAction().execute);

program.allowUnknownOption(false);

program.parse(process.argv);
