import express from 'express';
import { createLogger, Logger } from '@w3f/logger';
import { Config } from '@w3f/config';
import { InputConfig } from '../types';
import { WsMessageCenter } from "../messageCenter";
import { SubscriberFactory } from '../subscriber/subscriberFactory';
import { ISubscriber } from '../subscriber/ISubscriber';
import { Prometheus } from '../prometheus';

const _startHttpServer = (port: number): express.Application =>{
  const server = express();

  server.get('/healthcheck',
      async (req: express.Request, res: express.Response): Promise<void> => {
          res.status(200).send('OK!')
      })
      
  server.listen(port);
  return server
}

const _setSubscriberHandlers = (subscriber: ISubscriber, messageCenter: WsMessageCenter): void => {
  subscriber.setNewJudgementRequestHandler(messageCenter.newJudgementRequestHandler)
  subscriber.setJudgementUnrequestHandler(messageCenter.judgementUnrequestedHandler)
  subscriber.setJudgementGivenHandler(messageCenter.judgementGivenHandler)
}

export const startAction = async (cmd: { config: string }): Promise<void> =>{
 
  let logger: Logger

  try {
    const cfg = new Config<InputConfig>().parse(cmd.config);
    logger = createLogger(cfg.logLevel);
    
    const server = _startHttpServer(cfg.port)

    const promClient = new Prometheus(logger);
    promClient.injectMetricsRoute(server)
    promClient.startCollection()

    const subscriber = new SubscriberFactory(cfg,logger).makeSubscriber()
    await subscriber.start();

    const wsMC = new WsMessageCenter(cfg,subscriber,logger)
    _setSubscriberHandlers(subscriber, wsMC)
    wsMC.initServer()
  } catch (e) {
      const prefix = `exiting beacuse of: `
      const message = e.message ? prefix + e.message : JSON.stringify(e) ? prefix + JSON.stringify(e) : prefix + e
      logger ? logger.error(message) : console.log(message)
      process.exit(-1);
  }

  
}