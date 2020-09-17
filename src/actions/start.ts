import express from 'express';
import { createLogger, Logger } from '@w3f/logger';
import { Config } from '@w3f/config';
import { Subscriber } from '../subscriber';
import { InputConfig } from '../types';
import { WsMessageCenter } from "../messageCenter";

export class StartAction {
  private cfg: InputConfig;
  private subscriber: Subscriber;
  private logger: Logger;

  public execute = async (cmd: { config: string }): Promise<void> => {

    this._initInstanceVariables(cmd)

    await this.subscriber.start();

    const wsMC = new WsMessageCenter(this.cfg,this.logger,this.subscriber)
    this.subscriber.setNewJudgementRequestHandler(wsMC.newJudgementRequestHandler)
    this.subscriber.setJudgementUnrequestHandler(wsMC.judgementUnrequestedHandler)

    this._initHttpServer()

  }

  _initInstanceVariables = (cmd: { config: string }): void => {
    this.cfg = new Config<InputConfig>().parse(cmd.config);
    this.logger = createLogger(this.cfg.logLevel);
    this.subscriber = new Subscriber(this.cfg,this.logger);
  }

  _initHttpServer = (): void => {
    const server = express();

    server.get('/healthcheck',
        async (req: express.Request, res: express.Response): Promise<void> => {
            res.status(200).send('OK!')
        })

    server.listen(this.cfg.nodePort);
  }
}