import WebSocket from "ws";
import { Logger } from '@w3f/logger';
import { WsJudgementResult, WsChallengeRequest, WsErrorMessage, InputConfig, WsAck, WsChallengeUnrequest } from './types';
import { wrongFormatMessage, genericErrorMessage, connectionEstablished, messagAcknowledged } from "./utils";
import { ISubscriber } from "./subscriber/ISubscriber";

export class WsMessageCenter {
  private wsServer: WebSocket.Server

  constructor(cfg: InputConfig, readonly subscriber: ISubscriber, readonly logger: Logger) {
    this.wsServer = new WebSocket.Server({ port: cfg.portWs });

    //this.initServer()
  }
  
  public initServer = (): void => {
    
    this.wsServer.on('connection', wsConnection => {

      this.logger.info('connection enstablished')

      this._initConnectionHandlers(wsConnection)

    });
  }

  private _initConnectionHandlers = (wsConnection: WebSocket): void => {

    wsConnection.onmessage = async (event): Promise<void> => {
      this.logger.debug(`new message received:`)
      this.logger.debug(event.data.toString())
      const data = JSON.parse(event.data.toString())

      if(!data || !data['event']) {
        this.logger.error('wrong format')
        wsConnection.send(JSON.stringify(wrongFormatMessage as WsErrorMessage))
        return
      }

      if(data['event'] != 'ack'){
        wsConnection.send(JSON.stringify(messagAcknowledged as WsAck))
      }

      if(data['event'] == 'judgementResult'){
        const judgementResult: WsJudgementResult = data['data']
        await this.subscriber.handleTriggerExtrinsicJudgement(judgementResult.judgement,judgementResult.address)
      }

      if(data['event'] == 'pendingJudgementsRequest'){
        const response = await this.subscriber.getAllOurPendingWsChallengeRequests()
        this.logger.info('WsPendingChallengesResponse to be sent to the challenger app: '+JSON.stringify(response))
        wsConnection.send( JSON.stringify(response) ) 
      }

      if(data['event'] == 'displayNamesRequest'){
        const response = await this.subscriber.getAllDisplayNames()
        this.logger.info('WsDisplayNameResponse to be sent to the challenger app: '+JSON.stringify(response))
        wsConnection.send( JSON.stringify(response) ) 
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
    this.wsServer.clients.forEach(wsConnection => wsConnection.send( JSON.stringify(request)) )
  }

  public judgementUnrequestedHandler = (request: WsChallengeUnrequest): void => {
    this.logger.info('JudgementUnrequest to be sent to the challenger app: '+JSON.stringify(request))
    this.wsServer.clients.forEach(wsConnection => wsConnection.send( JSON.stringify(request)) )
  }

  public judgementGivenHandler = (message: WsAck): void => {
    this.logger.info('JudgementGivenAck to be sent to the challenger app: '+JSON.stringify(message))
    this.wsServer.clients.forEach(wsConnection => wsConnection.send(JSON.stringify(message)) )
  }
}