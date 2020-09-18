import WebSocket from "ws";
import { Logger } from '@w3f/logger';
import { WsJudgementResult, WsChallengeRequest, WsErrorMessage, InputConfig, WsAck, WsChallengeUnrequest, WsPendingChallengesResponse } from './types';
import { Subscriber } from "./subscriber";
import { wrongFormatMessage, genericErrorMessage, connectionEstablished } from "./utils";

export class WsMessageCenter {
  private wsServer: WebSocket.Server
  private subscriber: Subscriber

  constructor(cfg: InputConfig,readonly logger: Logger, subscriber: Subscriber) {
    this.setSubscriber(subscriber)
    this.wsServer = new WebSocket.Server({ port: cfg.challengerPort });

    this.initServer()
  }

  public setSubscriber = (subscriber: Subscriber): void => {
    this.subscriber = subscriber
  }

  public initServer = (): void => {
    
    this.wsServer.on('connection', wsConnection => {

      this.logger.info('connection enstablished')

      this._initConnectionHandlers(wsConnection)

    });
  }

  private _initConnectionHandlers = (wsConnection: WebSocket): void => {

    wsConnection.onmessage = async (event): Promise<void> => {
      this.logger.debug(event.data.toString())
      const data = JSON.parse(event.data.toString())

      if(!data || !data['event'] || !data['data']) {
        this.logger.error('wrong format')
        wsConnection.send(JSON.stringify(wrongFormatMessage as WsErrorMessage))
        return
      }

      if(data['event'] == 'judgementResult'){
        const judgementResult: WsJudgementResult = data['data']
        await this.subscriber.handleTriggerExtrinsicJudgement(judgementResult.judgement,judgementResult.address)
      }

      if(data['event'] == 'pendingJudgementsRequests'){
        wsConnection.send( JSON.stringify((await this.subscriber.getAllPendingWsChallengeRequests()) as WsPendingChallengesResponse ) ) 
      }
    }

    wsConnection.onerror = (event): void => {
      this.logger.error('Error:' +event.error)
      wsConnection.send(JSON.stringify(genericErrorMessage as WsErrorMessage))
    }

    wsConnection.onclose = (event): void => {
      this.logger.info(`connection with target ${event.target.url} closed`)
    }
  
    wsConnection.send(JSON.stringify(connectionEstablished as WsAck))
  }

  public newJudgementRequestHandler = (request: WsChallengeRequest): void => {
    this.logger.info('New Judgement Request to be sent to the challenger app: '+JSON.stringify(request))
    this.wsServer.clients.forEach(wsConnection => wsConnection.send( JSON.stringify(request as WsChallengeRequest)) )
  }

  public judgementUnrequestedHandler = (request: WsChallengeUnrequest): void => {
    this.logger.info('JudgementUnrequest to be sent to the challenger app: '+JSON.stringify(request))
    this.wsServer.clients.forEach(wsConnection => wsConnection.send( JSON.stringify(request as WsChallengeUnrequest)) )
  }
}