import WebSocket from "ws";
import { Logger } from '@w3f/logger';
import { WSEventType, WsJudgementResult, WsChallengeRequest, WsErrorMessage, InputConfig } from './types';
import { Subscriber } from "./subscriber";

const wrongFormatMessage = {
  event:WSEventType.error,
  data:{
    error: 'wrong format'
  }
}

const connectionEstablished = {
  event:WSEventType.WSAck,
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

      if(data['event'] == WSEventType.judgementResult.toString()){
        const judgementResult: WsJudgementResult = data['data']
        this.subscriber.handleTriggerExtrinsicJudgement(judgementResult.judgement,judgementResult.address)
      }
    }

    wsConnection.onclose = (event): void => {
      this.logger.info(`connection with target ${event.target.url} closed`)
    }
  
    wsConnection.send(JSON.stringify(connectionEstablished))
  }

  public newJudgementRequestHandler = (request: WsChallengeRequest): void => {
    this.logger.info('New Judgement Request to be sent to the challenger app: '+JSON.stringify(request))
    this.wsServer.clients.forEach(wsConnection => wsConnection.send( JSON.stringify(request)) )
  }
}