import WebSocket from "ws";
import { Logger } from '@w3f/logger';
import { WsJudgementResult, WsChallengeRequest, WsErrorMessage, InputConfig, WsAck } from './types';
import { Subscriber } from "./subscriber";

const wrongFormatMessage: WsErrorMessage = {
  event:'error',
  data:{
    error: 'wrong format'
  }
}

const genericErrorMessage: WsErrorMessage = {
  event:'error',
  data:{
    error: 'something wrong'
  }
}

const connectionEstablished: WsAck = {
  event:'ack',
  data:{
    result: 'connection Established'
  }
}

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

    wsConnection.onmessage = (event): void => {
      this.logger.debug(event.data.toString())
      const data = JSON.parse(event.data.toString())

      if(!data || data['event'] || data['data']) {
        this.logger.error('wrong format')
        wsConnection.send(JSON.stringify(wrongFormatMessage as WsErrorMessage))
        return
      }

      if(data['event'] == 'judgementResult'){
        const judgementResult: WsJudgementResult = data['data']
        this.subscriber.handleTriggerExtrinsicJudgement(judgementResult.judgement,judgementResult.address)
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
}