import express from 'express';
import { createLogger, Logger } from '@w3f/logger';
import { Config } from '@w3f/config';
import { InputConfig } from '../types';
import { WsMessageCenter } from "../messageCenter";
import { SubscriberFactory } from '../subscriber/subscriberFactory';
import { ISubscriber } from '../subscriber/ISubscriber';

export class StartAction {
  private cfg: InputConfig;
  private subscriber: ISubscriber;
  private logger: Logger;

  public execute = async (cmd: { config: string }): Promise<void> => {

    this._initInstanceVariables(cmd)

    await this.subscriber.start();

    const wsMC = new WsMessageCenter(this.cfg,this.subscriber,this.logger)
    this._setSubscriberHandlers(this.subscriber, wsMC)

    this._initHttpServer()

  }

  _initInstanceVariables = (cmd: { config: string }): void => {
    this.cfg = new Config<InputConfig>().parse(cmd.config);
    this.logger = createLogger(this.cfg.logLevel);
    this.subscriber = new SubscriberFactory(this.cfg,this.logger).makeSubscriber()
  }

  _setSubscriberHandlers = (subscriber: ISubscriber, messageCenter: WsMessageCenter): void => {
    subscriber.setNewJudgementRequestHandler(messageCenter.newJudgementRequestHandler)
    subscriber.setJudgementUnrequestHandler(messageCenter.judgementUnrequestedHandler)
    subscriber.setJudgementGivenHandler(messageCenter.judgementGivenHandler)
  }

  _initHttpServer = (): void => {
    const server = express();

    server.get('/healthcheck',
        async (req: express.Request, res: express.Response): Promise<void> => {
            res.status(200).send('OK!')
        })

    server.listen(this.cfg.port);
  }
}